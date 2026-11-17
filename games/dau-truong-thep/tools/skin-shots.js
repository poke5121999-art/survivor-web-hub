// Skins on the real page: the Skin panel at desktop 1280x720 and on the owner's phone (Xiaomi 17T, landscape
// 919x423 CSS px at DPR 3), the stage wearing an SS skin, and a sheet of 12 tanks x 3 skins at form III.
// Writes .chk/skins/*.png and fails on page errors.
//   timeout 900 node tools/skin-shots.js
'use strict';
const { session, open, CHK, fs, path } = require('./lib.js');
const OUT = path.join(CHK, 'skins');
const SIZES = [['desktop', 1280, 720, 1, false], ['phone', 919, 423, 3, true]];
const SHEET = ['trau', 'soi', 'hoalong', 'hacho', 'holy', 'athena', 'lubo', 'nguma', 'laclong', 'cuuvi', 'moclan', 'taothao'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const check = (name, ok, info) => { if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (!ok && info ? '  ' + info : '')); };

session(async (br, base) => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [tag, w, h, dpr, touch] of SIZES) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); localStorage.removeItem('dtt.save.v1'); } catch (e) {} });
    const g = await open(br, base, 'noaudio&q=low&seed=7', { ctx });
    const P = g.page;
    const shot = async (name) => { const f = path.join(OUT, `${tag}-${name}.png`); await P.screenshot({ path: f }); console.log('     ' + f); };
    await P.evaluate(() => {
      const G = window.__G, d = G.meta.get();
      d.owned = d.owned.concat(['moclan', 'hoalong']); d.lv.moclan = [5, 5, 5, 5, 5]; d.lv.hoalong = [5, 4, 4, 3, 2]; d.coins = 4200; d.gems = 120;
      d.ownedSkins = ['moclan:s']; d.skins.moclan = 's'; G.ui.showMenu();
    });
    await sleep(1200);
    await P.evaluate(() => document.querySelector('#ui .mc[data-mech="moclan"]').click());
    await sleep(900);
    await P.evaluate(() => document.querySelector('#ui .sg-skin').click());
    await P.waitForFunction(() => [...document.querySelectorAll('#ui .skc img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 120000 });
    await sleep(500);
    const r = await P.evaluate(() => ({ cards: [...document.querySelectorAll('#ui .skc')].map((c) => c.dataset.skin + (c.classList.contains('eq') ? '*' : '')).join(), imgs: [...document.querySelectorAll('#ui .skc img')].map((i) => i.naturalWidth), stage: window.__G.showcase.on }));
    check(`${tag}: the Skin panel shows goc / s (in use) / ss with rendered portraits, the 3D stage is closed under it`, r.cards === 'goc,s*,ss' && r.imgs.every((x) => x >= 128) && !r.stage, JSON.stringify(r));
    await shot('panel');
    await P.evaluate(() => document.querySelector('#ui .sk-tabs [data-g="SS"]').click());
    await sleep(300);
    await shot('panel-ss');
    await P.evaluate(() => { const d = window.__G.meta.get(); d.ownedSkins.push('moclan:ss'); document.querySelector('#ui .sk-tabs [data-g="all"]').click(); });
    await sleep(300);
    await P.evaluate(() => document.querySelector('#ui .skc[data-skin="ss"] [data-use]').click());
    await sleep(300);
    await P.evaluate(() => document.querySelector('#ui .skins [data-r="back"]').click());
    await sleep(1500);
    const st = await P.evaluate(() => ({ on: window.__G.showcase.on, skin: window.__G.meta.get().skins.moclan }));
    check(`${tag}: back on the tank select the stage reopens wearing the SS skin`, st.on && st.skin === 'ss', JSON.stringify(st));
    await shot('stage-ss');
    if (tag === 'desktop') {
      // 12 tanks x 3 skins at form III, two tanks per row.
      const url = await P.evaluate(async (keys) => {
        const G = window.__G, { SKINS } = await import(new URL('js/skins.js', location.href).href), { MECHS } = await import(new URL('js/data.js', location.href).href);
        const S = 256, LH = 44, cols = 6, rows = Math.ceil(keys.length / 2);
        const cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * (S + LH);
        const c = cv.getContext('2d'); c.fillStyle = '#0b2353'; c.fillRect(0, 0, cv.width, cv.height);
        const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
        const GC = { A: '#62e07a', S: '#3fd8ff', SS: '#ff5ae0' };
        for (let t = 0; t < keys.length; t++) {
          const k = keys[t];
          for (let j = 0; j < 3; j++) {
            const s = SKINS[k][j], x = ((t % 2) * 3 + j) * S, y = Math.floor(t / 2) * (S + LH);
            c.fillStyle = j === 0 ? '#0e2c66' : j === 1 ? '#0c3159' : '#2a1450'; c.fillRect(x + 2, y + 2, S - 4, S + LH - 4);
            c.drawImage(await load(G.portrait(k, 0, s.id, 3, S)), x, y + LH - 6, S, S);
            c.font = 'bold 15px sans-serif'; c.fillStyle = '#fff'; c.fillText(MECHS[k].name, x + 8, y + 18);
            c.fillStyle = GC[s.grade]; c.fillText(`${s.grade} · ${s.name}`, x + 8, y + 37);
          }
        }
        return cv.toDataURL('image/png');
      }, SHEET);
      const f = path.join(OUT, 'sheet-12x3-form3.png');
      fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      console.log('     ' + f);
    }
    check(`${tag}: no page errors`, g.problems.length === 0, g.problems.join(' | '));
    await ctx.close();
  }
  console.log(fail ? `${fail} FAIL` : 'all ok');
  process.exitCode = fail ? 1 : 0;
});
