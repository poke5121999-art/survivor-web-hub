/*
 * Vũ khí dưới đất như bản gốc: đứng gần thì hiện tên (trắng, mũi tên chỉ xuống) và dải item_info của HUD với 4 chỉ số;
 * nhặt/đổi súng thì tên bay lên trên đầu nhân vật; đi xa thì dải ẩn lại.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-floorweapon.js   (SK_URL, SK_SHOTS)
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-floorweapon');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const ev = (f, a) => p.evaluate(f, a);
  const shot = n => p.screenshot({ path: path.join(SHOTS, n + '.png') });
  const timer = setTimeout(() => { console.log('QUÁ HẠN 150 s'); process.exit(2); }, 150000);
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
    await ev(() => SK_GAME.debug.seed(20260929));
    await p.click('#sk-start');
    await p.waitForFunction(() => SK_GAME.state === 'stage', null, { timeout: 15000 });
    await sleep(2500);
    await ev(() => { SK_GAME.debug.god(true); SK_GAME.debug.teleportTo('chest', 0); });
    await sleep(600);
    check('phòng rương: chưa có vũ khí dưới đất thì dải item_info ẩn', await ev(() => !SK.hud.itemInfoShown() && !SK.G.items.length));

    // ---- mở rương bằng E; nếu rương phòng này không rơi súng thì đặt một rương vũ khí cạnh người chơi
    const chestInfo = await ev(() => { const c = SK.G.chests.filter(c => !c.open)[0], pl = SK.G.player; return c && { kind: c.kind, d: Math.hypot(c.x - pl.x, c.y - pl.y) }; });
    if (chestInfo && chestInfo.d > 20) await ev(() => { const c = SK.G.chests.filter(c => !c.open)[0], pl = SK.G.player; pl.x = c.x - 14; pl.y = c.y; });
    await sleep(200);
    await p.keyboard.press('KeyE'); await sleep(700);
    let items = await ev(() => SK.G.items.map(i => ({ id: i.id, x: i.x, y: i.y })));
    if (!items.length) {
      await ev(() => { const G = SK.G, pl = G.player; G.chests.push({ kind: 'weapon', x: pl.x + 14, y: pl.y, open: false, t: 0, openT: 0 }); });
      await sleep(200); await p.keyboard.press('KeyE'); await sleep(700);
      items = await ev(() => SK.G.items.map(i => ({ id: i.id, x: i.x, y: i.y })));
    }
    check('mở rương (E) làm rơi một vũ khí', items.length === 1, JSON.stringify(items) + ' · rương ' + JSON.stringify(chestInfo));
    const w = items[0];
    const def = await ev(id => { const d = SK.DS.weapons[id]; return { name: d.name, dmg: d.dmg, cost: d.cost, crit: d.crit, spread: d.spread }; }, w.id);

    // ---- đi xa: dải ẩn; đi lại gần bằng phím thật: dải hiện
    await ev(a => { const pl = SK.G.player; pl.x = a.x + 60; pl.y = a.y; }, w);
    await sleep(500);
    check('đứng xa vũ khí: dải item_info ẩn', await ev(() => !SK.hud.itemInfoShown() && !SK.G.interactTarget));
    await shot('1-far');
    await p.keyboard.down('KeyA');
    const near = await p.waitForFunction(() => SK.G.interactTarget && SK.G.interactTarget.weaponId, null, { timeout: 5000 }).then(() => true, () => false);
    await p.keyboard.up('KeyA');
    await sleep(500);
    const strip = await ev(() => {
      const t = id => SK.hud.node('item_info/wrapper/weapon_default/params/value' + id + '/Text').txt.s;
      const r = SK.hud.rect('item_info/wrapper/weapon_default');
      return { id: SK.hud.itemInfoShown(), nums: [1, 2, 3, 4].map(t), r, h: innerHeight, label: SK.G.interactTarget && SK.G.interactTarget.label };
    });
    check('đi lại gần bằng phím A: có mục tiêu nhặt là vũ khí', near && strip.id === w.id, JSON.stringify({ near, id: strip.id }));
    const want = [def.dmg, def.cost, def.crit, def.spread].map(v => String(Math.round(v || 0)));
    check('dải item_info hiện 4 số đúng của vũ khí ' + def.name, JSON.stringify(strip.nums) === JSON.stringify(want), strip.nums.join(' ') + ' vs ' + want.join(' '));
    check('dải nằm trong màn hình, sát đáy', strip.r && strip.r.w > 100 && strip.r.y + strip.r.h <= strip.h + 1 && strip.r.y > strip.h * 0.5, JSON.stringify(strip.r));
    await shot('2-near');

    // ---- nhặt: tên bay lên trên đầu, dải ẩn khi đi xa
    const before = await ev(() => SK.G.player.weapons[SK.G.player.cur].id);
    await p.keyboard.press('KeyE'); await sleep(350);
    const pick = await ev(() => ({ nf: SK.G.nameFloat && SK.G.nameFloat.text, cur: SK.G.player.weapons[SK.G.player.cur].id, items: SK.G.items.map(i => i.id), spare: SK.G.player.weapons[1 - SK.G.player.cur] && SK.G.player.weapons[1 - SK.G.player.cur].id }));
    check('nhặt (E): tên vũ khí bay trên đầu nhân vật', pick.nf === def.name, JSON.stringify(pick));
    check('nhặt (E): cầm súng mới, ô còn trống nên súng cũ cất ở ô kia', pick.cur === w.id && pick.items.length === 0 && pick.spare === before, JSON.stringify({ before, pick }));
    await shot('3-pickup');
    await sleep(1500);
    check('hết 1,4 s: tên bay biến mất', await ev(() => !SK.G.nameFloat));
    await ev(() => { SK.G.player.x += 80; });
    await sleep(500);
    check('đi xa khỏi súng dưới đất: dải item_info ẩn lại', await ev(() => !SK.hud.itemInfoShown()));
    await shot('4-away');
    check('không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('chạy hết bộ kiểm', false, e.message);
  }
  clearTimeout(timer);
  console.log(out.join('\n'));
  console.log(`\n${pass} đạt, ${fail} lỗi · ảnh ở ${SHOTS}`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
