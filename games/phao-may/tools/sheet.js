// Review sheets: shoots each unit, effect and screen in isolation and tiles them. Output: .chk/sheet-<group>.png
// Usage: PM_GL=gl-egl node games/phao-may/tools/sheet.js [group ...]
'use strict';
const { execFileSync } = require('child_process');
const { session, open, CHK, fs, path } = require('./lib.js');
const Q = 'noaudio=1&nogov=1&manual=1&q=' + (process.env.PM_Q || 'high');

const fire = (o, ticks) => `(() => { const s = window.__G.sim; s.wind = ${o.wind || 0}; if (${o.special ? 1 : 0}) s.active.special = 100; ${o.item !== undefined ? `s.useItem(${o.item});` : ''} __tick(4); __fire(${JSON.stringify(o)}); __tick(${ticks}); return s.phase; })()`;
const GROUPS = {
  world: [
    { name: 'wide', q: 'autostart=1&seed=3', pose: 'wide' },
    { name: 'turn-view', q: 'autostart=1&seed=3', eval: '__tick(60)', pose: 'keep' },
    { name: 'cliff', q: 'autostart=1&seed=3', pose: { x: 46, y: 56, dist: 50 } },
    { name: 'arch', q: 'autostart=1&seed=3', pose: { x: 86, y: 52, dist: 50 } },
    { name: 'hill', q: 'autostart=1&seed=3', pose: { x: 128, y: 59, dist: 46 } },
    { name: 'vinhda-wide', q: 'autostart=1&seed=3&map=vinhda', pose: 'wide' },
    { name: 'vinhda-east', q: 'autostart=1&seed=3&map=vinhda', pose: { x: 136, y: 54, dist: 50 } },
    { name: 'lolua-wide', q: 'autostart=1&seed=3&map=lolua', pose: 'wide' },
    { name: 'lolua-crater', q: 'autostart=1&seed=3&map=lolua', pose: { x: 84, y: 62, dist: 50 } },
    { name: 'bang-wide', q: 'autostart=1&seed=3&map=bang', pose: 'wide' },
    { name: 'bang-peak', q: 'autostart=1&seed=3&map=bang', pose: { x: 112, y: 60, dist: 50 } },
    { name: 'pho-wide', q: 'autostart=1&seed=3&map=pho', pose: 'wide' },
    { name: 'pho-deck', q: 'autostart=1&seed=3&map=pho', pose: { x: 46, y: 54, dist: 50 } },
    { name: 'hoangmac-wide', q: 'autostart=1&seed=3&map=hoangmac', pose: 'wide' },
    { name: 'hoangmac-gate', q: 'autostart=1&seed=3&map=hoangmac', pose: { x: 84, y: 46, dist: 50 } },
    { name: 'vinhda-tide', q: 'autostart=1&seed=3&map=vinhda', eval: '(() => { window.__G.sim.seaY = 33; __tick(240); })()', pose: { x: 86, y: 44, dist: 80 } }
  ],
  units: [
    { name: 'coc-son', q: 'autostart=1&seed=3&unit=coc&foe=coc', pose: { x: 30, y: 64.3, dist: 17 } },
    { name: 'coc-lam', q: 'autostart=1&seed=3&unit=coc&foe=coc', pose: { x: 136, y: 60.2, dist: 17 } },
    { name: 'chuon-son', q: 'autostart=1&seed=3&unit=chuon&foe=chuon', pose: { x: 30, y: 64.3, dist: 17 } },
    { name: 'chuon-lam', q: 'autostart=1&seed=3&unit=chuon&foe=chuon', pose: { x: 136, y: 60.2, dist: 17 } },
    { name: 'tegiac-son', q: 'autostart=1&seed=3&unit=tegiac&foe=oc', pose: { x: 30, y: 64.3, dist: 17 } },
    { name: 'oc-lam', q: 'autostart=1&seed=3&unit=tegiac&foe=oc', pose: { x: 136, y: 60.2, dist: 17 } },
    { name: 'sua-son', q: 'autostart=1&seed=3&unit=sua&foe=rua', pose: { x: 30, y: 64.8, dist: 17 } },
    { name: 'rua-lam', q: 'autostart=1&seed=3&unit=sua&foe=rua', pose: { x: 136, y: 60.2, dist: 17 } },
    { name: 'nhim-son', q: 'autostart=1&seed=3&unit=nhim&foe=co', pose: { x: 30, y: 64.3, dist: 17 } },
    { name: 'co-lam', q: 'autostart=1&seed=3&unit=nhim&foe=co', pose: { x: 136, y: 59.6, dist: 17 } }
  ],
  fx: [
    { name: 'muzzle', q: 'autostart=1&seed=3', eval: fire({ angle: 55, power: 60, shot: 0 }, 3), pose: { x: 40, y: 57, dist: 30 } },
    { name: 'flight', q: 'autostart=1&seed=3', eval: fire({ angle: 55, power: 60, shot: 0 }, 60), pose: 'keep' },
    { name: 'boom-0.1s', q: 'autostart=1&seed=3', eval: fire({ angle: 60, power: 42, shot: 0 }, 129), pose: { x: 59, y: 60, dist: 36 } },
    { name: 'boom-0.5s', q: 'autostart=1&seed=3', eval: fire({ angle: 60, power: 42, shot: 0 }, 152), pose: { x: 59, y: 60, dist: 36 } },
    { name: 'crater', q: 'autostart=1&seed=3', eval: fire({ angle: 60, power: 42, shot: 0 }, 330), pose: { x: 59, y: 58, dist: 30 } },
    { name: 'cluster', q: 'autostart=1&seed=3', eval: fire({ angle: 62, power: 62, shot: 2, special: true }, 150), pose: 'keep' },
    { name: 'split', q: 'autostart=1&seed=3&unit=chuon', eval: fire({ angle: 35, power: 60, shot: 1 }, 50), pose: 'keep' },
    { name: 'beam', q: 'autostart=1&seed=3&unit=chuon', eval: fire({ angle: 8, power: 100, shot: 2, special: true }, 16), pose: { x: 62, y: 58, dist: 60 } }
  ],
  ui: [
    { name: 'title', q: '', eval: '__tick(200)', pose: 'keep' },
    { name: 'quick', q: '', eval: '(() => { document.querySelector("[data-go=quick]").click(); __tick(2); })()', pose: 'keep' },
    { name: 'shop', q: '', eval: '(() => { document.querySelector("[data-go=shop]").click(); __tick(2); })()', pose: 'keep' },
    { name: 'campaign', q: '', eval: '(() => { const m = window.__G.meta; m.save.stage = 3; m.save.coins = 640; m.save.units = ["coc", "chuon"]; document.querySelector("[data-go=camp]").click(); __tick(2); })()', pose: 'keep' },
    { name: 'shop-up', q: '', eval: '(() => { const m = window.__G.meta; m.save.coins = 640; m.save.units = ["coc", "chuon"]; m.save.up = { coc: { hp: 2, atk: 1 } }; document.querySelector("[data-go=shop]").click(); __tick(2); })()', pose: 'keep' },
    { name: 'hud', q: 'autostart=1&seed=3', eval: '(() => { const G = window.__G; G.input.hold("fire", true); __tick(70); })()', pose: 'keep' },
    { name: 'hud-2v2', q: 'autostart=1&seed=3', eval: `(() => { const G = window.__G; G.startMatch({ seed: 5, map: 'doiche', first: 0, flip: false, playerTeam: 0, teams: [[{ kind: 'coc', name: 'Bạn', items: ['heal', 'shield', 'boost'] }, { kind: 'chuon', ai: 'medium', items: [] }], [{ kind: 'chuon', ai: 'medium', items: [] }, { kind: 'coc', ai: 'medium', items: [] }]] }); G.sim.useItem(1); __tick(30); })()`, pose: 'keep' },
    { name: 'phone', q: 'autostart=1&seed=3&q=low', vp: { width: 844, height: 390 }, touch: true, eval: '__tick(30)', pose: 'keep' }
  ]
};

session(async (br, base) => {
  fs.mkdirSync(CHK, { recursive: true });
  const groups = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GROUPS);
  for (const g of groups) {
    const files = [];
    for (const sc of GROUPS[g]) {
      const vp = sc.vp || { width: 1280, height: 720 };
      const ctx = await br.newContext({ viewport: vp, hasTouch: !!sc.touch, isMobile: !!sc.touch });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) {} });
      const page = await ctx.newPage();
      await page.goto(base + '/games/phao-may/index.html?' + Q + '&' + sc.q);
      await page.waitForFunction('window.__ready === true', null, { timeout: 180000 });
      if (sc.eval) await page.evaluate(sc.eval);
      if (sc.pose !== 'keep') await page.evaluate((p) => { window.__setShot(p); window.__step(2); }, sc.pose);
      await page.waitForTimeout(500);
      const file = path.join(CHK, `${g}-${sc.name}.png`);
      await page.screenshot({ path: file });
      const errs = await page.evaluate('window.__errors');
      console.log(g, sc.name, errs.length ? 'ERRORS ' + errs.join(' | ').slice(0, 400) : 'ok');
      files.push([sc.name, file]);
      await ctx.close();
    }
    const py = `import sys, json
from PIL import Image, ImageDraw
items = json.loads(sys.argv[1]); out = sys.argv[2]
tiles = [(n, Image.open(f).convert('RGB')) for n, f in items]
W, H = 640, 360; cols = 3; rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * (H + 22)), (20, 16, 24)); d = ImageDraw.Draw(sheet)
for i, (n, im) in enumerate(tiles):
    im.thumbnail((W, H)); x, y = (i % cols) * W, (i // cols) * (H + 22)
    sheet.paste(im, (x + (W - im.width) // 2, y + 22)); d.text((x + 6, y + 5), n, fill=(255, 220, 160))
sheet.save(out)`;
    const out = path.join(CHK, `sheet-${g}.png`);
    execFileSync('python3', ['-I', '-c', py, JSON.stringify(files), out]);
    console.log('sheet', out);
  }
});
