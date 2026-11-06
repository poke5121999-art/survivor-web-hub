/*
 * Ảnh chụp cố định của games/diablo2 (Ác Quỷ II) để so bản vẽ trước/sau một thay đổi engine, từng điểm ảnh.
 *   node test/diablo2-pixels.js shoot <thư mục>          chụp mọi cảnh vào <thư mục>/<cảnh>.png
 *   node test/diablo2-pixels.js diff <thư mục A> <thư mục B>  đếm điểm ảnh khác nhau từng cảnh, thoát 1 nếu có cảnh khác
 * Biến môi trường: PLAYWRIGHT_PATH, D2_URL, D2_SCENES=town,moor (chỉ chụp vài cảnh).
 *
 * Cảnh cố định nhờ Math.random gieo hạt trong trang và thế giới đóng băng (D2DBG.freeze) trước khi vào khu:
 * cùng mã luật thì cùng bản đồ, cùng quái, cùng khung hoạt ảnh. Ảnh chỉ chụp khi hai lần chụp liền nhau giống hệt
 * (mọi trang atlas đã nạp xong) và chữ "Entering X" đã tắt.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const path = require('path');
const fs = require('fs');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/').replace(/^\//, '');
const URL = process.env.D2_URL || (root + '/games/diablo2/index.html');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SEED = () => {
  let s = 20261008;
  Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
};

// mỗi cảnh: khu, rồi dựng trong trang (D2DBG đã có, thế giới đang đóng băng)
const SCENES = [
  { name: 'town', area: 'rogue_encampment' },
  { name: 'town-zoom', area: 'rogue_encampment', zoom: 0.5 },
  { name: 'moor', area: 'blood_moor', setup: () => {
    const ids = D2DBG.monIds();
    for (let i = 0; i < 8; i++) D2DBG.spawn(ids[i % ids.length], 1, 2 + (i % 4) * 1.6, -2 + Math.floor(i / 4) * 3, i === 5 ? 'unique' : 'normal');
    const ms = D2DBG.S.ents.filter(e => e.kind === 'mon');
    ms[ms.length - 1].tintKind = 'cold'; ms[ms.length - 1].tintUntil = 1e9;
    ms[ms.length - 2].tintKind = 'poison'; ms[ms.length - 2].tintUntil = 1e9;
  } },
  { name: 'cata', area: 'catacombs_level_2' },
  { name: 'den-warp', area: 'den_of_evil', setup: () => {
    const S = D2DBG.S, L = S.grid.levels[S.areaId], w = L.lv.exits.filter(e => e.kind === 'warp')[0];
    if (w) { D2DBG.teleport(w.x + 2, w.y + 2); S.hover = w; }
  } },
  { name: 'lut', area: 'lut_gholein' },
  { name: 'docks', area: 'kurast_docks' },
  { name: 'fortress', area: 'the_pandemonium_fortress' },
  { name: 'harrogath', area: 'harrogath' },
  { name: 'chaos', area: 'the_chaos_sanctuary' }
];

async function canvasShot(p) { return p.locator('#view').screenshot(); }

async function shoot(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const { chromium } = require(PW);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 600 } });
  await ctx.addInitScript(SEED);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('.screen.title .tmenu', { timeout: 60000 });
  await p.click('.tmenu button:has-text("Trò chơi mới")');
  await p.waitForSelector('.ccard');
  await p.click('.ccard[data-cls=sorceress]');
  await p.fill('#pname', 'Pixel');
  await p.click('#pgo');
  await p.waitForFunction(() => window.D2DBG && D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 60000 });
  await p.evaluate(() => { D2DBG.freeze(true); Object.keys(D2DATA.quests).forEach(k => { D2DBG.S.char.quests[k] = 'done'; }); });
  const only = process.env.D2_SCENES ? process.env.D2_SCENES.split(',') : null;
  for (const sc of SCENES) {
    if (only && !only.includes(sc.name)) continue;
    await p.mouse.move(2, 2);
    await p.evaluate(a => D2DBG.goto(a), sc.area);
    await p.evaluate(z => D2DBG.zoom(z), sc.zoom || 1);
    if (sc.setup) await p.evaluate(sc.setup);
    // chờ "Entering X" tắt (3-4 s) và ảnh đứng yên
    await sleep(4300);
    let prev = await canvasShot(p), shot = null;
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      shot = await canvasShot(p);
      if (shot.equals(prev)) break;
      prev = shot;
    }
    fs.writeFileSync(path.join(dir, sc.name + '.png'), shot);
    await p.evaluate(() => { D2DBG.zoom(1); D2DBG.S.hover = null; });
    console.log('chụp ' + sc.name);
  }
  if (errs.length) console.log('LỖI TRANG: ' + errs.slice(0, 5).join(' | '));
  await b.close();
}

async function diff(a, b) {
  const { chromium } = require(PW);
  const br = await chromium.launch();
  const p = await br.newPage();
  await p.goto('about:blank');
  let bad = 0;
  for (const f of fs.readdirSync(a).filter(f => f.endsWith('.png')).sort()) {
    if (!fs.existsSync(path.join(b, f))) { console.log(f.padEnd(20) + ' thiếu ở ' + b); bad++; continue; }
    const r = await p.evaluate(async ([x, y]) => {
      const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + src; });
      const [ia, ib] = [await load(x), await load(y)];
      if (ia.width !== ib.width || ia.height !== ib.height) return { size: true };
      const px = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const da = px(ia), db = px(ib); let n = 0, mx = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (d) { n++; if (d > mx) mx = d; }
      }
      return { n, mx, total: da.length / 4 };
    }, [fs.readFileSync(path.join(a, f)).toString('base64'), fs.readFileSync(path.join(b, f)).toString('base64')]);
    if (r.size) { console.log(f.padEnd(20) + ' khác kích thước'); bad++; continue; }
    console.log(f.padEnd(20) + (r.n ? ' KHÁC ' + r.n + ' điểm ảnh (' + (r.n / r.total * 100).toFixed(3) + '%), lệch tối đa ' + r.mx : ' giống hệt'));
    if (r.n) bad++;
  }
  await br.close();
  process.exit(bad ? 1 : 0);
}

const [cmd, x, y] = process.argv.slice(2);
if (cmd === 'shoot' && x) shoot(x).catch(e => { console.error(e); process.exit(1); });
else if (cmd === 'diff' && x && y) diff(x, y).catch(e => { console.error(e); process.exit(1); });
else { console.log('node test/diablo2-pixels.js shoot <dir> | diff <dirA> <dirB>'); process.exit(2); }
