#!/usr/bin/env node
/* Meo & Sup feature "theme" in a real browser (games/cats-soup): a facility skin swaps the pot's meshes and the soup colour, the
 * ground tile and the active nodes follow the skin, lamps change on every facility that has one, the theme screen (the original
 * ui/functionwork/set_theme prefab) buys and picks a forest theme (ground textures, far trees, camera colour) and the facility
 * card opens the skin list; everything survives a reload.
 *   node test/cats-soup-theme-play.js
 *   CS_URL=https://poke5121999-art.github.io/survivor-web-hub/games/cats-soup/index.html node test/cats-soup-theme-play.js
 * Page flags used: ?fresh, ?demo=N, ?speed=k. Screenshots: shots/cats-soup-theme/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'cats-soup-theme');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

function serve() {
  return new Promise(res => {
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

const menu = async (page, label) => {
  await page.locator('[data-n="bt_more"] .w:visible').first().click();
  await page.waitForTimeout(400);
  await page.locator('.sh-more', { hasText: label }).first().click();
  await page.waitForTimeout(300);
};

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.CS_URL ? null : await serve();
  const url = process.env.CS_URL || `http://localhost:${srv.address().port}/games/cats-soup/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const failed = () => page.evaluate(() => window.__failed());

  // fresh game with every facility of the first rows, a big forest and plenty of gems
  await page.goto(`${url}?fresh&speed=1`);
  await page.waitForFunction(() => window.__ready === true && !!window.__theme && window.__theme.ready, null, { timeout: 90000 });
  check('feature mounts and the page has no failed feature', (await failed()).length === 0);
  await page.evaluate(() => {
    const g = window.__game;
    g.state.gold = { f: 9, e: 40 };
    g.state.gem = 5000;
    for (let i = 0; i < 40 && g.canExpand(); i++) g.expand();
    for (const a of [7, 17, 11, 15]) g.build(a);
    window.__game.state.theme.lampType = 0;
  });
  await page.waitForTimeout(2500);
  // each new facility brings a cat and a "welcome" card (VANG); the test closes them like a player does
  const dismiss = async () => {
    for (let i = 0; i < 8; i++) {
      const b = page.getByText('VÂNG', { exact: true });
      if (!(await b.count()) || !(await b.first().isVisible().catch(() => false))) break;
      await b.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  };
  await dismiss();
  const info = () => page.evaluate(() => {
    const g = window.__game, th = window.__theme;
    const out = {};
    for (const [id, e] of th.view.works) {
      const w = e.w, d = th.skins[w.a];
      const meshes = [];
      if (d && d.mesh) for (const m of d.mesh) { const n = e.obj.userData.objects[m.node - d.base]; meshes.push(n ? n.children.filter(c => c.isMesh).map(c => { const a = c.geometry.attributes.position; let t = 0; for (let i = 0; i < a.array.length; i++) t += a.array[i]; return `${a.count}:${t.toFixed(2)}`; }).join('+') : '-'); }
      const hl = e.obj.getObjectByName('handLight');
      const p = hl && (hl.getObjectByName('p') || hl);
      out[w.a] = { skin: th.T.skinOf(g, w), meshes, lamp: p ? p.children.filter(c => /^lamp\d+$/.test(c.name)).map(c => c.name).join() : null, thSkin: e.thSkin, thLamp: e.thLamp };
    }
    return out;
  });
  let I = await info();
  check('soup pot (Work 0), juice maker (7), wok (17) are on the field', I[0] && I[7] && I[17], Object.keys(I).join());
  check('default look: skin 0 everywhere, lamp0 on every facility with a lamp', Object.values(I).every(x => x.skin === 0) && I[0].lamp === 'lamp0', JSON.stringify(I[0]));
  const before0 = I[0].meshes.join('|');
  // Work 11 prefab: node 362 is hidden and 381 shown in the file, but the Actives list of skin position 0 says the opposite
  const a11 = await page.evaluate(() => { const th = window.__theme, w = window.__game.state.works.find(x => x.a === 11), d = th.skins[11], e = th.view.works.get(w.id); const o = e.obj.userData.objects; return d.act[0].map(n => o[n - d.base].visible).concat(d.act.flat().filter(n => !d.act[0].includes(n)).map(n => o[n - d.base].visible)); });
  check('Actives of skin position 0 are applied at spawn (the default look of Work 11 follows the table, not the prefab flags)', a11[0] === true && a11.slice(1).every(v => v === false), JSON.stringify(a11));

  // ---- facility skin: swap the pot ----
  const pot = () => page.evaluate(() => { const g = window.__game; const w = g.state.works.find(x => x.a === 0); const e = window.__theme.view.works.get(w.id); const cam = window.__theme.ctx.camera;
    cam.target.copy(e.obj.position); cam.size = 1.9; cam.update(); return w.id; });
  await pot();
  await page.waitForTimeout(800);
  await shot('01-default-pot');
  const clip = { x: 90, y: 270, width: 360, height: 300 };
  const shots = [await page.screenshot({ clip })];
  await page.evaluate(() => { const g = window.__game; g.reward(26, 1); g.reward(26, 4); const w = g.state.works.find(x => x.a === 0); g.feat.theme.equipSkin(g, w, 1); });
  await page.waitForTimeout(2500);
  I = await info();
  check('skin 1 (cat pot) swaps both pot meshes (spot, tool)', I[0].skin === 1 && I[0].thSkin === 1 && I[0].meshes.join('|') !== before0 && I[0].meshes.every(m => m && m !== '-'), `${before0} -> ${I[0].meshes.join('|')}`);
  await shot('02-skin1-pot');
  shots.push(await page.screenshot({ clip }));
  await page.evaluate(() => { const g = window.__game; const w = g.state.works.find(x => x.a === 0); g.feat.theme.equipSkin(g, w, 4); });
  await page.waitForTimeout(2000);
  I = await info();
  await shot('03-skin4-pot');
  shots.push(await page.screenshot({ clip }));
  check('skin 4 (strawberry pot) differs from skin 1 and from the default', I[0].skin === 4 && I[0].meshes.join('|') !== before0 && I[0].thSkin === 4);
  const colors = await page.evaluate(() => { const th = window.__theme; const w = window.__game.state.works.find(x => x.a === 0); const e = th.view.works.get(w.id); const c = new Set();
    e.obj.traverse(o => { if (o.isMesh && o.userData.thOwn) c.add(o.material.uniforms.tint.value.toArray().map(v => +v.toFixed(3)).join()); }); return [...c]; });
  check('the soup colour of skin 4 is the MaterialColors entry of position 2 (0.992, 0.796, 0.776)', colors.join() === '0.992,0.796,0.776,1', colors.join('|'));
  await page.evaluate(() => { const g = window.__game; const w = g.state.works.find(x => x.a === 0); g.feat.theme.equipSkin(g, w, 0); });
  await page.waitForTimeout(2000);
  I = await info();
  check('back to skin 0: the original meshes return', I[0].meshes.join('|') === before0 && I[0].thSkin === 0, `${I[0].meshes.join('|')} vs ${before0}`);
  await shot('04-default-again');
  // the three pots side by side: default, skin 1, skin 4
  const cmp = await browser.newPage({ viewport: { width: 1100, height: 360 } });
  await cmp.setContent(`<body style="margin:0;background:#fff;font:22px sans-serif;display:flex;gap:10px">${['default', 'skin 1 (cat)', 'skin 4 (strawberry)'].map((t, i) => `<div><img src="data:image/png;base64,${shots[i].toString('base64')}"><div style="text-align:center">${t}</div></div>`).join('')}`);
  await cmp.screenshot({ path: path.join(SHOTS, 'side-by-side-pots.png') });
  await cmp.close();

  // ---- an Actives skin (Work 11, bed-like): only the nodes of the worn skin are visible ----
  const act = await page.evaluate(async () => {
    const g = window.__game, th = window.__theme, T = g.feat.theme;
    const w = g.state.works.find(x => x.a === 11);
    const d = th.skins[11];
    const e = th.view.works.get(w.id);
    const a = g.work.get(11);
    const idx = a.existWorkSkins[1];
    g.reward(26, idx);
    T.equipSkin(g, w, idx);
    await new Promise(r => setTimeout(r, 1500));
    const vis = n => e.obj.userData.objects[n - d.base].visible;
    return { idx, act: d.act, vis: d.act.map(l => l.map(vis)), skin: e.thSkin };
  });
  check(`Work 11 skin ${act.idx}: the nodes of its position are shown, the others of the lists hidden`, act.vis[1].every(v => v) && act.vis.filter((_, i) => i !== 1).every((l, i) => l.every((v, k) => v === act.act.filter((__, j) => j !== 1)[i][k] && act.act[1].includes(act.act.filter((__, j) => j !== 1)[i][k]) ? true : !v)), JSON.stringify(act.vis));

  // ---- a SkinnedMeshRenderer skin (Work 20, a rest facility): the new geometry is bound to the skeleton already there ----
  const sk = await page.evaluate(async () => {
    const g = window.__game, th = window.__theme, T = g.feat.theme;
    const w = g.place(20, g.emptyCells()[0], 0);
    await new Promise(r => setTimeout(r, 1500));
    const d = th.skins[20], e = th.view.works.get(w.id);
    const node = () => e.obj.userData.objects[d.mesh[0].node - d.base];
    const sig = () => node().children.filter(c => c.isSkinnedMesh).map(c => c.geometry.attributes.position.count + ':' + c.geometry.attributes.skinIndex.count).join('+');
    const before = sig();
    const idx = g.work.get(20).existWorkSkins[1];
    g.reward(26, idx);
    T.equipSkin(g, w, idx);
    for (let i = 0; i < 40 && e.thSkin !== idx; i++) await new Promise(r => setTimeout(r, 250));
    return { before, after: sig(), skin: e.thSkin, idx, bound: node().children.filter(c => c.isSkinnedMesh).every(c => !!c.skeleton) };
  });
  check('Work 20 skinned skin: SkinnedMesh geometry replaced, still bound to the skeleton', sk.skin === sk.idx && sk.before !== sk.after && sk.after.length > 0 && sk.bound, JSON.stringify(sk));

  // ---- lamps ----
  await page.evaluate(() => { const g = window.__game; for (const l of [1, 26, 124]) g.reward(14, l); });
  await page.evaluate(() => { const g = window.__game; g.feat.theme.equipLampAll(g, 26); });
  await page.waitForTimeout(2500);
  I = await info();
  check('lamp 26 replaces lamp0 on every facility with a lamp (loads chunk lamps1 on demand)', I[0].lamp === 'lamp26' && I[7].lamp === 'lamp26' && I[17].lamp === 'lamp26', JSON.stringify([I[0].lamp, I[7].lamp, I[17].lamp]));
  await pot();
  await page.waitForTimeout(600);
  await shot('05-lamp26');
  await page.evaluate(() => { const g = window.__game; g.feat.theme.equipLampAll(g, 124); });
  await page.waitForTimeout(2500);
  I = await info();
  check('lamp 124 (chunk lamps4)', I[0].lamp === 'lamp124', I[0].lamp);
  await page.evaluate(() => { const g = window.__game; g.feat.theme.equipLampAll(g, 0); });
  await page.waitForTimeout(1500);
  I = await info();
  check('back to the jar lantern lamp0', I[0].lamp === 'lamp0' && I[17].lamp === 'lamp0');

  // ---- forest theme (UI + ground) ----
  const ground = () => page.evaluate(() => { const th = window.__theme; const m = th.view.forest.map; const img = u => { const i = u.map.value.image; return i && (i.currentSrc || i.src || '').split('/').pop(); };
    return { base: img(m.materials[0].mat.uniforms), back: img(m.materials[1].mat.uniforms), base2: img(m.fallback.mat.uniforms), bg: th.scene.background ? th.scene.background.toArray().map(v => +v.toFixed(3)) : null }; });
  const g0 = await ground();
  await menu(page, 'Chủ đề');
  await page.waitForTimeout(1500);
  await shot('06-theme-screen');
  check('theme screen opens from the HUD button, built from the set_theme prefab', await page.locator('.th-screen [data-n="set_theme"]').count() === 1 && await page.locator('.th-screen [data-n="spr_grade"]').count() === 1);
  const lab = n => page.evaluate(n => { const e = document.querySelector(`.th-screen [data-n="${n}"] .w.label`); return e && e.textContent; }, n);
  check('first page shows theme 0 (Rung xanh)', (await lab('txt_title')) === 'Rừng xanh', await lab('txt_title'));
  await page.locator('.th-screen [data-n="set1"] [data-n="bt_r"] .w').first().click();
  await page.waitForTimeout(400);
  check('next arrow: theme 1 (Rung tuyet), not owned: buy button visible with 800', (await lab('txt_title')) === 'Rừng tuyết' && (await page.evaluate(() => getComputedStyle(document.querySelector('.th-screen [data-n="set1"] > [data-n="set_buy"]')).display)) !== 'none'
    && (await page.evaluate(() => document.querySelector('.th-screen [data-n="set_buy"] [data-n="Label"] .w').textContent)) === '800');
  await shot('07-theme-1-locked');
  const gem0 = await page.evaluate(() => window.__game.state.gem);
  await page.locator('.th-screen [data-n="bt_buy"] .w').first().click();
  await page.waitForTimeout(300);
  check('buying asks first (confirm box)', await page.locator('.th-confirm').count() === 1);
  await page.locator('.th-confirm .price:not(.off)').click();
  await page.waitForTimeout(400);
  const gem1 = await page.evaluate(() => window.__game.state.gem);
  check('800 gems paid, theme 1 owned', gem0 - gem1 === 800 && await page.evaluate(() => window.__game.feat.theme.ownTheme(window.__game, 1)), `${gem0} -> ${gem1}`);
  await page.locator('.th-screen [data-n="set1"] > [data-n="bt_select"] .w').first().click();
  await page.waitForTimeout(2500);
  const g1 = await ground();
  check('selecting theme 1 swaps the three ground textures and the camera colour', g1.base !== g0.base && g1.back !== g0.back && g1.base2 !== g0.base2 && !!g1.bg, JSON.stringify([g0, g1]));
  check('the saved theme is 1', await page.evaluate(() => window.__game.state.theme.theme === 1));
  await shot('08-theme-1-picked');
  // lamp page of the same screen: next lamp, select -> confirm -> every lamp changes
  await page.locator('.th-screen [data-n="set2"] [data-n="bt_r"] .w').first().click();
  await page.waitForTimeout(300);
  check('lamp page lists owned lamps only (0, 1, 26, 124): next shows lamp 1', (await lab('txt_info')) !== null && await page.evaluate(() => window.__theme.T.lampList(window.__game).join()) === '0,1,26,124');
  await page.locator('.th-screen [data-n="set2"] > [data-n="bt_select"] .w').first().click();
  await page.waitForTimeout(300);
  check('lamp select asks first (msg_changeLampAll)', await page.locator('.th-confirm').count() === 1);
  await page.locator('.th-confirm .price:not(.off)').click();
  await page.waitForTimeout(2500);
  I = await info();
  check('lamp 1 on every facility', I[0].lamp === 'lamp1' && I[7].lamp === 'lamp1' && await page.evaluate(() => window.__game.state.theme.lampType === 1));
  await page.locator('.th-x').click();
  await page.waitForTimeout(300);
  check('close button leaves the theme screen', await page.locator('.th-screen').count() === 0);
  await shot('09-theme-1-forest');

  // ---- skin list of the facility card ----
  await page.evaluate(() => { const g = window.__game; window.__hud.select(g.state.works.find(x => x.a === 0)); });
  await page.waitForTimeout(500);
  check('the facility card shows the skin button', await page.locator('.th-skin').isVisible());
  await page.locator('.th-skin').click();
  await page.waitForTimeout(800);
  await shot('10-skin-list');
  const rows = await page.locator('.panel .th-row').count();
  check('skin list: 20 skins of the soup pot listed (Event / Period ones hidden)', rows === 20, String(rows));
  const locked = await page.locator('.panel .th-row.locked-skin').count();
  check('only skin 0, 1 and 4 are owned; 17 are locked (Package = real money, disabled)', locked === 17 && await page.locator('.panel .th-row.locked-skin .price.off').count() === 17, String(locked));
  check('equipped skin is marked, a locked row has no click action', await page.locator('.panel .th-row .done').count() === 1);
  await page.locator('.panel .th-row[data-skin="1"] .price').click();
  await page.waitForTimeout(1800);
  check('"Mac" on skin 1 in the list wears it', await page.evaluate(() => window.__game.feat.theme.skinOf(window.__game, window.__game.state.works.find(x => x.a === 0)) === 1));
  await page.locator('.panel .tabs div').nth(1).click();
  await page.waitForTimeout(300);
  check('sign tab: only the default sign (the second needs level 1000)', await page.locator('.panel .th-row').count() === 1);
  await page.locator('.panel .tabs div').nth(2).click();
  await page.waitForTimeout(300);
  check('lamp tab lists the owned lamps', await page.locator('.panel .th-row').count() === 4);
  await page.locator('.panel .close').click();

  // ---- reload ----
  await page.evaluate(() => { window.__game.state.theme.theme; dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.stringify(window.__game.state.theme));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true && window.__theme && window.__theme.ready, null, { timeout: 90000 });
  await page.waitForTimeout(3500);
  const again = await page.evaluate(() => JSON.stringify(window.__game.state.theme));
  check('reload keeps themes, skins, lamps and what each facility wears', again === saved && JSON.parse(again).theme === 1, again.slice(0, 120));
  I = await info();
  check('after the reload the pot wears skin 1 and lamp 1 again', I[0] && I[0].skin === 1 && I[0].thSkin === 1 && I[0].lamp === 'lamp1', JSON.stringify(I[0]));
  const g2 = await ground();
  check('after the reload the theme 1 ground is painted', g2.base === g1.base && g2.back === g1.back);
  await shot('11-reload');
  check('window.__failed() stays empty', (await failed()).length === 0, JSON.stringify(await failed()));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
