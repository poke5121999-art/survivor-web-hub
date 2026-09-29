/*
 * Kiểm thử thế giới Season Mode của Hiệp Sĩ Linh Hồn (games/soulknight/js/season/world.js + season.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-season-world.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-season-world/.
 *
 * Vòng thật: sảnh → thẻ "Chế độ mùa giải" → Bắt đầu; giữ phím đi trong căn cứ tới khi rừng chặn;
 * bước vào cổng xoáy → Ngoại ô căn cứ; tới trại khỉ, giữ J bắn tới khi hạ được một con (bật god để không chết);
 * mở thùng quái + một thùng thường bằng E, nhặt đồ bằng E; đứng trong điểm rút lui 5 s → về căn cứ.
 * Lượt hai: ra lại bản đồ rồi gục → về căn cứ, balô bị xoá.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-season-world');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(80);
  }
  return false;
}
const info = p => p.evaluate(() => SK.SEASON.debug.info);
async function hold(p, key, ms) { await p.keyboard.down(key); await sleep(ms); await p.keyboard.up(key); }
async function press(p, key) { await p.keyboard.down(key); await sleep(60); await p.keyboard.up(key); await sleep(60); }

(async () => {
  const b = await chromium.launch();
  // 1300x560 -> engine chọn tỉ lệ 2, khung nhìn ~650x280 px thế giới, gần khung ~647x300 của ảnh e_0929_101229 (2.14 px/px)
  const ctx = await b.newContext({ viewport: { width: 1300, height: 560 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => {
    try { localStorage.removeItem('sk.season.v1'); } catch (_) { /* riêng tư */ }
    window.__ev = { kill: 0, loot: 0, extract: 0, death: 0 };
    SK.on('seasonKill', () => __ev.kill++); SK.on('seasonLoot', () => __ev.loot++);
    SK.on('seasonExtract', () => __ev.extract++); SK.on('seasonDeath', () => __ev.death++);
    if (SK.SEASON.inv && SK.SEASON.inv.reset) SK.SEASON.inv.reset();
  });

  // ---- sảnh → thẻ chế độ mùa giải
  await p.click('#hs-back');
  await p.click('.hs-mode[data-mode="season"]');
  const goTxt = await p.textContent('#hs-mode-go');
  const soon = await p.evaluate(() => !!document.querySelector('.hs-mode[data-mode="season"] .hs-soon'));
  check('thẻ mùa giải không còn "Sắp ra mắt"', goTxt.trim() === 'Bắt đầu' && !soon, 'nút: ' + goTxt.trim());
  await p.click('#hs-mode-go');
  const inSeason = await until(p, () => SK.G.state === 'season' && SK.SEASON.debug.info && SK.SEASON.debug.info.mode === 'base', null, 5000);
  let s = await info(p);
  check('vào căn cứ Season Mode', inSeason, s && ('máu ' + s.hp + '/' + s.hpMax + ' giáp ' + s.armor));
  check('máu mùa = máu gốc + 2×giáp, giáp 0', !!s && s.hpMax === 6 + 2 * 5 && s.armor === 0, s && s.hpMax + '');
  await sleep(1200);
  await p.screenshot({ path: path.join(SHOTS, '1-base.png') });

  // ---- đi trong căn cứ: xuống con đường dọc rồi đâm vào rừng phía nam
  const y0 = s.y;
  await hold(p, 'KeyS', 3200);
  s = await info(p);
  const blocked = await p.evaluate(() => { const P = SK.G.player; return SK.world.solidAt(SK.G.map, P.x, P.y + 4); });
  check('đi bằng phím trong căn cứ', s.y > y0 + 100, 'y ' + Math.round(y0) + ' → ' + Math.round(s.y));
  check('rừng chặn lại (không xuyên cây)', blocked && s.y < y0 + 330, 'dừng ở y ' + Math.round(s.y) + ', ô dưới chân chắn: ' + blocked);
  await p.screenshot({ path: path.join(SHOTS, '2-base-forest-wall.png') });

  // ---- cổng xoáy phía bắc
  await p.evaluate(() => SK.SEASON.debug.tpTo('portal'));
  await p.keyboard.down('KeyW');
  const deployed = await until(p, () => SK.SEASON.debug.info.map === 's1' && SK.SEASON.debug.info.mode === 'expedition', null, 6000);
  await p.keyboard.up('KeyW');
  s = await info(p);
  check('bước vào cổng → Ngoại ô căn cứ', deployed, s.map + ' · ' + s.enemies + ' quái · ' + s.crates + ' thùng');
  await sleep(700);
  await p.screenshot({ path: path.join(SHOTS, '3-outskirt-entry.png') });

  // ---- trại khỉ: giữ J bắn thật
  await p.evaluate(() => { SK.SEASON.debug.god(); SK.SEASON.debug.tpTo('camp', 3); });
  await sleep(400);
  await p.keyboard.down('KeyJ');
  let killed = await until(p, () => __ev.kill > 0, null, 25000);
  await p.screenshot({ path: path.join(SHOTS, '4-fight.png') });
  await p.keyboard.up('KeyJ');
  const ev1 = await p.evaluate(() => Object.assign({}, __ev));
  check('hạ khỉ bằng súng (seasonKill)', killed, 'kills ' + ev1.kill);
  if (!killed) await p.evaluate(() => SK.SEASON.debug.killNearest());
  const mc = await p.evaluate(() => {
    const c = SK.G.season.crates.find(q => q.type.startsWith('monster') && !q.open);
    if (!c) return null;
    SK.SEASON.debug.tp(c.x, c.y + 12);
    return { weapon: c.weapon, type: c.type };
  });
  check('quái rớt thùng quái có vũ khí nó cầm', !!mc && !!mc.weapon, mc && (mc.type + ' · ' + mc.weapon));
  await sleep(250);
  let label = (await info(p)).interact;
  await press(p, 'KeyE');
  s = await info(p);
  check('mở thùng quái bằng E', s.opened >= 1 && s.loot > 0, 'nhãn "' + label + '" · ' + s.loot + ' món rơi');
  // nhặt hết đồ rơi quanh thùng bằng E
  let picked = 0;
  for (let k = 0; k < 8; k++) {
    const it = await p.evaluate(() => { const L = SK.G.season.loot[0]; if (!L) return null; SK.SEASON.debug.tp(L.x, L.y); return L.id; });
    if (!it) break;
    await sleep(120);
    await press(p, 'KeyE');
    picked++;
  }
  s = await info(p);
  const invInfo = await p.evaluate(() => {
    const I = SK.SEASON.inv;
    if (!I || !I.state) return 'không có mô-đun kho: ' + JSON.stringify(SK.SEASON.debug.info.bag);
    const bp = I.state.backpack.filter(Boolean).map(x => x.id + 'x' + x.n);
    const eq = [I.state.equip.weapon1, I.state.equip.weapon2].filter(Boolean).map(x => x.id);
    return 'balô [' + bp.join(', ') + '] · vũ khí [' + eq.join(', ') + ']';
  });
  check('nhặt đồ bằng E vào balô', picked > 0 && s.loot === 0, invInfo);

  // ---- thùng thường
  await p.evaluate(() => SK.SEASON.debug.tpTo('crate', 0));
  await sleep(250);
  label = (await info(p)).interact;
  const before = (await info(p)).opened;
  await press(p, 'KeyE');
  s = await info(p);
  const ev2 = await p.evaluate(() => __ev.loot);
  check('mở thùng thường (seasonLoot)', s.opened > before && ev2 >= 2, 'nhãn "' + label + '"');
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '5-crate.png') });

  // ---- điểm rút lui
  await p.evaluate(() => SK.SEASON.debug.tpTo('exit', 0));
  await sleep(2500);
  await p.screenshot({ path: path.join(SHOTS, '6-extract.png') });
  const midT = (await info(p)).extract;
  const back = await until(p, () => SK.SEASON.debug.info.map === 'base' && SK.SEASON.debug.info.mode === 'base', null, 8000);
  const ev3 = await p.evaluate(() => __ev.extract);
  check('đứng trong vòng 5 s → về căn cứ (seasonExtract)', back && ev3 === 1 && midT > 1 && midT < 5, 'đếm giữa chừng ' + midT.toFixed(1) + ' s');
  await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, '7-back-at-base.png') });

  // ---- lượt chết
  await p.evaluate(() => SK.SEASON.debug.tpTo('portal'));
  await p.keyboard.down('KeyW');
  await until(p, () => SK.SEASON.debug.info.mode === 'expedition', null, 6000);
  await p.keyboard.up('KeyW');
  await p.evaluate(() => { if (SK.SEASON.inv && SK.SEASON.inv.add) SK.SEASON.inv.add((SK.SEASON.itemOrder || [])[0], 1); SK.SEASON.debug.kill(); });
  const died = await until(p, () => SK.SEASON.debug.info.mode === 'dead', null, 4000);
  const home = await until(p, () => SK.SEASON.debug.info.mode === 'base' && SK.SEASON.debug.info.map === 'base', null, 6000);
  s = await info(p);
  const bpAfter = await p.evaluate(() => SK.SEASON.inv && SK.SEASON.inv.state ? SK.SEASON.inv.state.backpack.filter(Boolean).length : 0);
  const ev4 = await p.evaluate(() => __ev.death);
  check('gục ngoài bản đồ → về căn cứ, mất balô (seasonDeath)', died && home && ev4 === 1 && bpAfter === 0 && s.st === 'alive',
    'máu ' + s.hp + '/' + s.hpMax + ' · vũ khí ' + s.weapons.filter(Boolean).join(','));

  // ---- bản đồ: điểm đánh dấu
  const mk = await p.evaluate(() => SK.SEASON.world.markers().map(m => m.kind));
  check('markers() có bạn + cổng + công trình', mk.includes('self') && mk.includes('portal') && mk.includes('building'), mk.join(','));

  // ---- về sảnh
  await p.evaluate(() => SK.SEASON.exit());
  const lob = await until(p, () => SK.G.state === 'lobby', null, 3000);
  check('thoát về sảnh', lob);

  check('không lỗi trang', errs.length === 0, errs.slice(0, 4).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + pass + '/' + (pass + fail) + ' đạt · ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
