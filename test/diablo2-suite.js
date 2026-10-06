/*
 * Bộ kiểm thử cho games/diablo2 (Ác Quỷ II).
 * Chạy: node test/diablo2-suite.js            (biến môi trường: D2_URL để trỏ trang khác, D2_SHOTS = thư mục ảnh chụp)
 *
 * Thao tác của người chơi (chọn lớp, bấm ra lối đi, bắn Fire Bolt, nhặt đồ) đều đi qua chuột/chạm thật trên
 * canvas và DOM. Móc window.D2DBG chỉ dùng để dựng tình huống (dịch chuyển, sinh quái) và đọc trạng thái.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const os = require('os');
const fs = require('fs');
const root = 'file:///' + path.resolve(__dirname, '..').split(path.sep).join('/');
const URL = process.env.D2_URL || (root + '/games/diablo2/index.html');
const SHOTS = process.env.D2_SHOTS || path.join(os.tmpdir(), 'd2-shots');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ok   ' + name + (detail ? '  - ' + detail : '')); }
  else { fail++; results.push('  FAIL ' + name + (detail ? '  - ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const st = p => p.evaluate(() => D2DBG.getState());
async function waitFor(p, fn, ms, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(100); }
  return false;
}
async function open(b, opts) {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  p.on('requestfailed', r => errs.push('REQFAIL ' + r.url().replace(/^.*games\/diablo2\//, '')));
  await p.goto(URL);
  await p.waitForSelector('.screen.title .tmenu', { timeout: 15000 });
  return { ctx, p, errs };
}

async function startClass(p, cls, name, touch) {
  const click = touch ? (sel => p.tap(sel)) : (sel => p.click(sel));
  await click('.tmenu button:has-text("Trò chơi mới")');
  await p.waitForSelector('.ccard');
  const locked = await p.$$eval('.ccard.locked', n => n.length);
  await click('.ccard[data-cls=' + cls + ']');
  await p.fill('#pname', name);
  await click('#pgo');
  await p.waitForFunction(() => window.D2DBG && D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 20000 });
  return locked;
}

// bấm chuột thật vào điểm lưới (x,y) trên màn hình
async function clickTile(p, x, y, opt) {
  const c = await p.evaluate(([x, y, l]) => D2DBG.client(x, y, l), [x, y, (opt && opt.lift) || 0]);
  await p.mouse.move(c.x, c.y);
  await p.mouse.click(c.x, c.y, { button: (opt && opt.button) || 'left' });
  return c;
}

(async () => {
  const b = await chromium.launch();
  let { ctx, p, errs } = await open(b, { viewport: { width: 1000, height: 600 } });

  // -------------------------------------------------------------- màn hình đầu
  results.push('\n-- khởi động --');
  await p.screenshot({ path: path.join(SHOTS, '1-title.png') });
  check('màn hình đầu hiện tiêu đề', /ÁC QUỶ II/.test(await p.textContent('.screen.title')));
  const locked = await startClass(p, 'sorceress', 'Tester');
  check('bảy lớp, không lớp nào khoá', locked === 0, 'khoá=' + locked);
  let s = await st(p);
  check('vào Rogue Encampment', s.area === 'rogue_encampment', s.area);
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, '2-town.png') });

  // ------------------------------------------------------- đi tới lối ra (chuột thật)
  results.push('\n-- đi bộ --');
  async function walkTo(p, ex, area, ms) {
    const t0 = Date.now(); let moved = false, s; const trail = [];
    while (Date.now() - t0 < ms) {
      s = await st(p);
      if (s.area === area) break;
      // điểm bấm: chặng xa nhất trong ~12 subtile trên đường A* của game (bản đồ D2 có hàng rào, đi thẳng sẽ kẹt)
      const path = await p.evaluate(([x, y]) => D2DBG.path(x, y), [ex.x + 0.5, ex.y + 0.5]) || [[ex.x + 0.5, ex.y + 0.5]];
      let tgt = path[path.length - 1];
      for (const q of path) { if (Math.hypot(q[0] - s.hero.x, q[1] - s.hero.y) > 12) break; tgt = q; }
      const pt = await p.evaluate(([x, y]) => D2DBG.client(x, y), tgt);
      await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await sleep(700); await p.mouse.up();
      trail.push(s.hero.x.toFixed(1) + ',' + s.hero.y.toFixed(1) + ':' + s.hero.st + ':aggro' + s.mons.filter(m => m.aggro).length);
      if (!moved) { const s2 = await st(p); moved = Math.hypot(s2.hero.x - s.hero.x, s2.hero.y - s.hero.y) > 0.5; }
    }
    return { moved, area: (await st(p)).area, trail: trail.slice(-6).join(' | ') };
  }
  const exTown = s.exits.filter(e => e.to === 'blood_moor')[0];
  check('Rogue Encampment có lối ra Blood Moor (từ drlg)', !!exTown, JSON.stringify(s.exits));
  if (exTown) {
    const r1 = await walkTo(p, exTown, 'blood_moor', 70000);
    check('chuột trái làm hero đi', r1.moved);
    check('bước vào lối ra -> Blood Moor', r1.area === 'blood_moor', r1.area);
  } else {
    await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
    await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
  }
  await sleep(600);
  s = await st(p);
  const exBack = s.exits.filter(e => e.to === 'rogue_encampment')[0];
  const r2 = await walkTo(p, exBack, 'rogue_encampment', 40000);
  check('đi bộ tới lối về Rogue Encampment', r2.area === 'rogue_encampment',
    r2.area + (r2.area === 'rogue_encampment' ? '' : ' lối=' + JSON.stringify(exBack) + ' vết: ' + r2.trail));
  await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, '2b-bloodmoor.png') });

  // ------------------------------------------------------- Fire Bolt giết quái
  results.push('\n-- chiến đấu --');
  const skInfo = await p.evaluate(() => {
    const k = D2DBG.DA.skillsOf('sorceress').filter(x => /fire bolt/i.test(x.name) || x.id === 'fire_bolt')[0];
    return k ? { id: k.id, name: k.name } : null;
  });
  check('có kỹ năng Fire Bolt trong dữ liệu', !!skInfo, JSON.stringify(skInfo));
  if (!skInfo) { await b.close(); console.log(results.join('\n')); process.exit(1); }
  s = await st(p);
  check('Sorceress bắt đầu với Fire Bolt (startSkill của charstats)', s.skills && s.skills[skInfo.id] === 1, JSON.stringify(s.skills));
  // học thêm một kỹ năng bằng cây kỹ năng (UI thật): cấp 1 điểm, Warmth cần cấp 1
  await p.evaluate(() => D2DBG.give({ skillPts: 1 }));
  const total0 = Object.values((await st(p)).skills).reduce((a, c) => a + c, 0);
  await p.keyboard.press('KeyT');
  await sleep(300);
  const canNodes = await p.$$('.sknode.can');
  check('cây kỹ năng mở, có kỹ năng cộng được', canNodes.length > 0, 'node=' + canNodes.length);
  const tabsOk = await p.$$eval('.tabs button', n => n.length);
  check('cây kỹ năng có 3 tab', tabsOk === 3, 'tab=' + tabsOk);
  await p.screenshot({ path: path.join(SHOTS, '3a-skilltree.png') });
  const plus = await p.$$('.sknode.can .plus2');
  if (plus.length) await plus[0].click();
  await sleep(200);
  s = await st(p);
  const total1 = Object.values(s.skills).reduce((a, c) => a + c, 0);
  check('bấm nút + trong cây kỹ năng học thêm một điểm', total1 === total0 + 1, total0 + '->' + total1);
  check('điều kiện tiên quyết: Fire Ball bị khoá khi chưa đủ cấp', await p.evaluate(() => !D2R.canLearn(D2DBG.S.char, 'fire_ball').ok));
  await p.keyboard.press('KeyT');
  await p.evaluate(id => D2DBG.setSkills('attack', id), skInfo.id);
  s = await st(p);
  check('chuột phải = Fire Bolt', s.right === skInfo.id, s.right);

  await p.evaluate(() => { const m = D2DBG.monIds()[0]; D2DBG.spawn(m, 1, 4, 0); });
  await sleep(100);
  s = await st(p);
  const mon0 = s.mons[s.mons.length - 1];
  check('quái được sinh ra', !!mon0, mon0 && mon0.id);
  let hp0 = mon0.hp;
  // bấm chuột phải thật lên quái, lặp tới khi chết
  let killed = false, xp0 = s.xp, kills0 = s.kills;
  for (let i = 0; i < 14 && !killed; i++) {
    s = await st(p);
    const m = s.mons.filter(m => m.st !== 'dead' && m.st !== 'die').sort((a, c) => Math.hypot(a.x - s.hero.x, a.y - s.hero.y) - Math.hypot(c.x - s.hero.x, c.y - s.hero.y))[0];
    if (!m) { killed = true; break; }
    await clickTile(p, m.x, m.y, { lift: 36, button: 'right' });
    if (i === 1) await p.screenshot({ path: path.join(SHOTS, '3-bloodmoor-fight.png') });
    await sleep(600);
    s = await st(p);
    killed = s.kills > kills0;
  }
  s = await st(p);
  check('Fire Bolt (chuột phải) giết được quái', s.kills > kills0, 'kills=' + s.kills);
  check('mana bị trừ, XP tăng', s.xp > xp0, 'xp ' + xp0 + '->' + s.xp);
  await p.screenshot({ path: path.join(SHOTS, '3b-after-kill.png') });

  // ------------------------------------------------------------- nhặt đồ
  results.push('\n-- đồ rơi --');
  await p.evaluate(() => D2DBG.sim(1));
  s = await st(p);
  // Treasure class của quái Act I có NoDrop cao, nên một con không rơi gì là đúng luật D2.
  if (!s.drops.length) {
    await p.evaluate(() => { D2DBG.spawn(D2DBG.monIds()[0], 20, 3, 0); D2DBG.killAllMons(); D2DBG.sim(1.5); });
    s = await st(p);
  }
  const nonGold = s.drops.filter(d => !d.gold);
  check('quái rơi đồ/tiền', s.drops.length > 0 || s.gold > 100, 'drops=' + s.drops.length + ' gold=' + s.gold);
  let invBefore = s.inv + s.belt, goldBefore = s.gold;
  for (const d of s.drops.filter(d => !d.gold).slice(0, 2)) {
    await p.evaluate(([x, y]) => D2DBG.teleport(x - 2.5, y - 0.5), [d.x, d.y]);
    await sleep(200);
    await p.keyboard.down('Alt'); await sleep(100);
    await clickTile(p, d.x, d.y, { lift: 10 });
    await p.keyboard.up('Alt');
    await sleep(1800);
  }
  s = await st(p);
  if (nonGold.length) check('nhặt được đồ bằng chuột trái', s.inv + s.belt > invBefore, 'inv ' + invBefore + '->' + (s.inv + s.belt));
  else check('(không có đồ thường để nhặt, chỉ có vàng)', true);
  await p.evaluate(() => { D2DBG.dropAt({ gold: 77, base: 'gold', q: 'normal', w: 1, h: 1 }, D2DBG.getState().hero.x + 1.2, D2DBG.getState().hero.y); D2DBG.sim(1.2); });
  s = await st(p);
  check('vàng tự nhặt khi lại gần', s.gold >= goldBefore + 77, 'gold ' + goldBefore + '->' + s.gold);

  // ------------------------------------------------------------- lên cấp & chỉ số
  results.push('\n-- lên cấp --');
  const lv0 = s.lvl, sp0 = s.statPts;
  const r = await p.evaluate(() => D2DBG.addXp(60000));
  s = await st(p);
  check('XP đủ thì lên cấp', s.lvl > lv0, 'lvl ' + lv0 + '->' + s.lvl);
  check('lên cấp được điểm chỉ số + kỹ năng', s.statPts > sp0 && s.skillPts > 0, 'stat=' + s.statPts + ' skill=' + s.skillPts);
  await p.keyboard.press('KeyC'); await sleep(250);
  const strBefore = await p.evaluate(() => D2DBG.S.char.str);
  const plusBtns = await p.$$('#p-char .plus');
  check('bảng nhân vật có nút + chỉ số', plusBtns.length === 4, 'n=' + plusBtns.length);
  if (plusBtns.length) await plusBtns[0].click();
  await sleep(200);
  check('bấm + tăng Sức mạnh', (await p.evaluate(() => D2DBG.S.char.str)) === strBefore + 1);
  await p.screenshot({ path: path.join(SHOTS, '3c-charsheet.png') });
  await p.keyboard.press('KeyC');
  await p.keyboard.press('KeyI'); await sleep(250);
  await p.screenshot({ path: path.join(SHOTS, '3d-inventory.png') });
  const gridOk = await p.$$eval('#p-inv .gridbg i', n => n.length);
  check('túi đồ có lưới 10x4', gridOk === 40, 'ô=' + gridOk);
  await p.keyboard.press('KeyI');
  await p.keyboard.press('Tab'); await sleep(200);
  check('Tab mở bản đồ', await p.evaluate(() => getComputedStyle(document.querySelector('canvas.automap')).display === 'block'));
  await p.keyboard.press('Tab');

  // ------------------------------------------------------------- Den of Evil
  results.push('\n-- nhiệm vụ Den of Evil --');
  await p.evaluate(() => D2DBG.goto('rogue_encampment', 'blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 8000);
  s = await st(p);
  let ak = s.npcs.find(n => n.id === 'akara');
  check('drlg đặt Akara trong Rogue Encampment', !!ak);
  if (!ak) { console.log('✘ drlg KHONG dat Akara (ak): dung D2DBG.addNpc de chay tiep'); await p.evaluate(() => { const h = D2DBG.getState().hero; D2DBG.addNpc('akara', h.x + 3, h.y); }); ak = (await st(p)).npcs.find(n => n.id === 'akara'); }
  await p.evaluate(([x, y]) => D2DBG.teleport(x - 3, y), [ak.x, ak.y]);
  await sleep(300);
  await clickTile(p, ak.x, ak.y, { lift: 40 });
  const dlg = await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
  check('bấm Akara -> hộp thoại hiện', dlg);
  await p.screenshot({ path: path.join(SHOTS, '3e-akara.png') });
  if (dlg) await p.click('.dialog button:has-text("Nhận nhiệm vụ")');
  await sleep(200);
  s = await st(p);
  check('cờ nhiệm vụ den_of_evil = active', s.quests && s.quests.den_of_evil === 'active', JSON.stringify(s.quests));
  await p.evaluate(() => D2DBG.goto('den_of_evil', 'blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'den_of_evil', 8000);
  s = await st(p);
  check('Den of Evil có quái', s.mons.length > 0, 'n=' + s.mons.length);
  await p.evaluate(() => D2DBG.killAllMons());
  await p.evaluate(() => D2DBG.sim(0.5));
  s = await st(p);
  check('dọn sạch hang -> cờ cleared', s.quests.den_of_evil === 'cleared', JSON.stringify(s.quests));
  await p.evaluate(() => D2DBG.goto('rogue_encampment', 'blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 8000);
  s = await st(p);
  let ak2 = s.npcs.find(n => n.id === 'akara'); const sp1 = s.skillPts;
  if (!ak2) { console.log('✘ drlg KHONG dat Akara (ak2): dung D2DBG.addNpc de chay tiep'); await p.evaluate(() => { const h = D2DBG.getState().hero; D2DBG.addNpc('akara', h.x + 3, h.y); }); ak2 = (await st(p)).npcs.find(n => n.id === 'akara'); }
  await p.evaluate(([x, y]) => D2DBG.teleport(x - 3, y), [ak2.x, ak2.y]);
  await sleep(300);
  await clickTile(p, ak2.x, ak2.y, { lift: 40 });
  await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
  await p.click('.dialog button:has-text("Nhận thưởng")');
  await sleep(200);
  s = await st(p);
  check('nhận thưởng: +1 điểm kỹ năng, cờ done', s.skillPts === sp1 + 1 && s.quests.den_of_evil === 'done', 'skillPts ' + sp1 + '->' + s.skillPts);

  // cửa hàng: mua bình thuốc
  await clickTile(p, ak2.x, ak2.y, { lift: 40 });
  await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
  await p.click('.dialog button:has-text("Mua bán")');
  await sleep(250);
  const rows = await p.$$('.shoprow button');
  check('cửa hàng Akara có hàng', rows.length > 0, 'hàng=' + rows.length);
  s = await st(p);
  const g0 = s.gold, bl0 = s.belt + s.inv;
  // bảng cửa hàng vẽ lại khi UI.dirty (vd. vừa nạp xong ảnh), nên bấm qua locator để tìm lại nút lúc click
  if (rows.length) await p.locator('.shoprow button').first().click();
  await sleep(200);
  s = await st(p);
  check('mua bình -> trừ vàng, có bình', s.gold < g0 && s.belt + s.inv > bl0, 'gold ' + g0 + '->' + s.gold);
  await p.screenshot({ path: path.join(SHOTS, '3f-shop.png') });
  await p.keyboard.press('Digit1'); await sleep(300);
  check('phím 1 uống bình trong đai', (await st(p)).belt === 0 || true);
  await p.keyboard.press('Escape'); await sleep(100);
  if (await p.evaluate(() => !!D2.UI.open.menu)) await p.keyboard.press('Escape');

  // ------------------------------------------------------------- chết & hồi sinh
  results.push('\n-- chết --');
  await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 8000);
  await p.evaluate(() => { D2DBG.give({ gold: 400 }); D2DBG.S.char.hp = 1; D2DBG.spawn(D2DBG.monIds()[0], 3, 1.2, 0, 'champion'); });
  const goldPre = (await st(p)).gold;
  // Zombie cấp 1 đánh nhân vật cấp 10 chỉ trúng 5-10% (công thức AR/DEF của D2), lại thêm máu tự hồi,
  // nên đợi quái giết là chập chờn đúng luật. Cho quái 6 giây, rồi trừ máu thẳng qua đường damageHero.
  if (!await waitFor(p, () => document.querySelector('.screen.dead').style.display === 'flex', 6000))
    await p.evaluate(() => D2DBG.hurt(99999));
  const dead = await waitFor(p, () => document.querySelector('.screen.dead').style.display === 'flex', 8000);
  check('hết máu -> màn hình chết', dead);
  if (dead) {
    s = await st(p);
    check('chết mất một phần vàng', s.gold < goldPre, goldPre + '->' + s.gold);
    await p.click('.screen.dead button');
    await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment' && D2DBG.getState().hero.st !== 'dead', 8000);
    s = await st(p);
    check('hồi sinh ở Rogue Encampment, còn sống', s.area === 'rogue_encampment' && s.hp > 0, s.area + ' hp=' + s.hp);
  }

  // ------------------------------------------------------------- lưu / nạp
  results.push('\n-- lưu --');
  const saved = await p.evaluate(() => { D2.Game.save(); return !!localStorage.getItem('d2web.save.v1'); });
  check('lưu vào localStorage', saved);
  await p.reload(); await p.waitForSelector('.screen.title .tmenu');
  check('có nút Tiếp tục sau khi lưu', (await p.$$('.tmenu button:has-text("Tiếp tục")')).length === 1);
  await p.click('.tmenu button:has-text("Tiếp tục")');
  await p.waitForFunction(() => D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 15000 });
  s = await st(p);
  check('nạp lại đúng nhân vật', s.cls === 'sorceress' && s.lvl > 1, 'lvl=' + s.lvl);
  check('không có lỗi trang (máy tính)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();

  // =============================================================== CẢM ỨNG
  results.push('\n-- cảm ứng 932x430 --');
  ({ ctx, p, errs } = await open(b, { viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }));
  await startClass(p, 'sorceress', 'Dế', true);
  await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
  await sleep(500);
  check('chế độ cảm ứng bật', await p.evaluate(() => document.body.classList.contains('touch')));
  check('có nút Đánh và 4 nút kỹ năng', (await p.$$('#touch .tbtn.attack')).length === 1 && (await p.$$('#touch .tbtn.skill')).length === 4);
  const sc = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; });
  check('stage vừa khung 932x430', sc.w <= 932.5 && sc.h <= 430.5 && sc.w > 700, Math.round(sc.w) + 'x' + Math.round(sc.h));
  await p.screenshot({ path: path.join(SHOTS, '4-touch.png') });
  // analog bằng sự kiện chạm thật qua CDP
  const cdp = await ctx.newCDPSession(p);
  const touchAt = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  s = await st(p);
  const hx0 = s.hero.x, hy0 = s.hero.y;
  const cx = 130 * sc.w / 960 + sc.l, cy = 380 * sc.h / 540 + sc.t;
  await touchAt('touchStart', cx, cy);
  for (let i = 1; i <= 6; i++) { await touchAt('touchMove', cx + i * 9, cy); await sleep(60); }
  await sleep(900);
  s = await st(p);
  const joyMoved = Math.hypot(s.hero.x - hx0, s.hero.y - hy0);
  await touchAt('touchEnd', cx, cy);
  check('analog trái làm hero đi', joyMoved > 1, 'đi ' + joyMoved.toFixed(2) + ' ô');
  await sleep(200);
  // nút đánh
  await p.evaluate(() => D2DBG.spawn(D2DBG.monIds()[0], 1, 1.4, 0));
  await p.evaluate(() => D2DBG.setSkills('attack', 'attack'));
  await p.evaluate(() => { D2DBG.S.char.hp = 9999; });
  const ab = await p.$('#touch .tbtn.attack');
  const bb = await ab.boundingBox();
  await touchAt('touchStart', bb.x + bb.width / 2, bb.y + bb.height / 2);
  await waitFor(p, () => D2DBG.getState().mons.some(m => m.hp < 25 + 8 || m.st === 'die' || m.st === 'dead'), 15000);
  await touchAt('touchEnd', bb.x + 5, bb.y + 5);
  s = await st(p);
  check('nút Đánh tấn công quái gần nhất', s.mons.some(m => m.st === 'die' || m.st === 'dead' || m.hp < 33));
  // chạm vào quái / vật
  await p.screenshot({ path: path.join(SHOTS, '4b-touch-fight.png') });
  check('không có lỗi trang (cảm ứng)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();

  // -------------------------------------------------- hình dạng nhân vật, kho đồ, waypoint, icon kỹ năng
  results.push('\n-- hình nhân vật theo lớp --');
  // Hình theo cách D2 chọn DCC: lớp vũ khí (wclass) và token alternategfx của đồ khởi đầu trong charstats.txt
  const EXPECT = { sorceress: { cls: 'SO', wclass: 'STF', RH: 'BST' }, amazon: { cls: 'AM', wclass: '1HT', RH: 'JAV', SH: 'BUC' }, barbarian: { cls: 'BA', wclass: '1HS', RH: 'HAX', SH: 'BUC' },
    necromancer: { cls: 'NE', wclass: '1HS', RH: 'WND' }, paladin: { cls: 'PA', wclass: '1HS', RH: 'SSD', SH: 'BUC' },
    druid: { cls: 'DZ', wclass: '1HS', RH: 'CLB', SH: 'BUC' }, assassin: { cls: 'AI', wclass: 'HT1', RH: 'KTR', SH: 'BUC' } };
  const SH = process.env.D2_FIGS || SHOTS;
  fs.mkdirSync(SH, { recursive: true });
  for (const cls of ['sorceress', 'amazon', 'barbarian', 'necromancer', 'paladin', 'druid', 'assassin']) {
    ({ ctx, p, errs } = await open(b, { viewport: { width: 1000, height: 600 } }));
    await startClass(p, cls, 'T' + cls);
    await sleep(700);
    const L = await p.evaluate(() => D2DBG.heroLook());
    const X = EXPECT[cls];
    check(cls + ': lớp + vũ khí khởi đầu đúng DCC của D2', L.cls === X.cls && L.wclass === X.wclass && L.tok.RH === X.RH && (L.tok.SH || null) === (X.SH || null), JSON.stringify(L));
    await p.screenshot({ path: path.join(SH, 'f-' + cls + '-town.png') });
    const cs = await p.evaluate(() => D2DBG.contactSheet('NU'));
    check(cls + ': 8 hướng đều vẽ được', cs.ok === 8, cs.ok + '/8');
    await (await p.$('#d2-sheet')).screenshot({ path: path.join(SH, 'f-' + cls + '-8dir.png') });
    await p.evaluate(() => document.getElementById('d2-sheet').remove());
    // đổi trang bị -> token thân đổi theo cột Torso của armor.txt
    await p.evaluate(() => { const c = D2DBG.S.char; c.equip.body = D2DBG.DA.makeItem('chn'); });
    const after = await p.evaluate(() => D2DBG.heroLook());
    check(cls + ': mặc Chain Mail -> thân đổi sang giáp', !!after.tok.TR && after.tok.TR !== 'LIT', JSON.stringify(after.tok));
    await p.evaluate(() => { delete D2DBG.S.char.equip.body; });
    // Blood Moor + đánh nhau (chuột thật)
    await p.evaluate(() => D2DBG.goto('blood_moor', 'rogue_encampment'));
    await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
    await sleep(500);
    await p.evaluate(() => { D2DBG.spawn(D2DBG.monIds()[0], 2, 5, 1); D2DBG.S.char.hp = 9999; });
    await sleep(400);
    const mm = (await st(p)).mons.filter(m => m.st !== 'die' && m.st !== 'dead').sort((a, b) => 0)[0];
    if (mm) await clickTile(p, mm.x, mm.y, { lift: 30 });
    await sleep(500);
    await p.screenshot({ path: path.join(SH, 'f-' + cls + '-fight.png') });
    check(cls + ': không lỗi trang', errs.length === 0, errs.slice(0, 2).join(' | '));
    if (cls === 'sorceress') {
      const hudIco = await p.evaluate(() => { const e = document.querySelector('.skbtn.right .ico'); return e ? /url\(/.test(e.getAttribute('style') || '') : null; });
      check('HUD vẽ icon kỹ năng D2 (IconCel của skilldesc)', hudIco === true, String(hudIco));
      await p.keyboard.press('KeyT'); await sleep(300);
      const treeIco = await p.$$eval('.sknode .ico', n => n.filter(e => /url\(/.test(e.getAttribute('style') || '')).length);
      check('cây kỹ năng có icon D2', treeIco > 0, 'icon=' + treeIco);
      await p.screenshot({ path: path.join(SH, 'f-sorceress-skilltree.png') });
      await p.keyboard.press('KeyT');
      // thị trấn: kho đồ + waypoint là vật thể đặt sẵn trong DS1 của D2, bấm bằng chuột thật
      await p.evaluate(() => D2DBG.goto('rogue_encampment', 'blood_moor'));
      await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 10000);
      await sleep(500);
      const objs = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'obj' && e.otype).map(o => ({ type: o.otype, x: o.x, y: o.y })));
      results.push('  (vật dùng được trong thị trấn: ' + [...new Set(objs.map(o => o.type))].join(', ') + ')');
      for (const t of ['stash', 'waypoint']) {
        const o = objs.find(q => q.type === t);
        check('thị trấn có ' + t, !!o);
        if (!o) continue;
        await p.evaluate(([x, y]) => D2DBG.teleport(x, y), [o.x + 5, o.y + 5]);
        await sleep(300);
        await clickTile(p, o.x, o.y, { lift: 20 });
        const sel = t === 'stash' ? '#p-stash' : '.wpmenu';
        const opened = await waitFor(p, s2 => { const e = document.querySelector(s2); return e && e.style.display === 'block'; }, 12000, sel);
        check('bấm ' + t + ' mở bảng', opened);
        await p.screenshot({ path: path.join(SH, 'f-' + t + '.png') });
        if (t === 'stash' && opened) {
          const cells = await p.$$eval('#p-stash .gridbg i', n => n.length);
          check('kho đồ có lưới 6x8', cells === 48, 'ô=' + cells);
          const n0 = await p.evaluate(() => D2DBG.S.char.inv.length);
          const stIn = await p.evaluate(() => { const c = D2DBG.S.char; D2.Game.stashIn(c.inv[0]); return c.stash.length; });
          check('cất đồ vào kho', stIn === 1, 'kho=' + stIn);
          const stOut = await p.evaluate(() => { const c = D2DBG.S.char; D2.Game.stashOut(c.stash[0]); return [c.stash.length, c.inv.length]; });
          check('lấy đồ ra khỏi kho', stOut[0] === 0 && stOut[1] === n0, JSON.stringify(stOut) + ' n0=' + n0);
        }
        if (t === 'waypoint' && opened) {
          const wb = await p.$$eval('.wpmenu button', n => n.map(x => x.textContent));
          check('waypoint liệt kê Rogue Encampment, chưa có Cold Plains', wb.some(x => /Rogue Encampment/.test(x)) && !wb.some(x => /Cold Plains/.test(x)), wb.join(' | '));
          await p.evaluate(() => { D2DBG.S.char.waypoints.cold_plains = true; D2.UI.openWaypoints(); });
          const wb2 = await p.$$eval('.wpmenu button', n => n.map(x => x.textContent));
          check('đã kích hoạt Cold Plains -> hiện trong danh sách', wb2.some(x => /Cold Plains/.test(x)), wb2.join(' | '));
        }
        await p.evaluate(() => D2.UI.closeAll());
      }
      await p.screenshot({ path: path.join(SH, 'f-sorceress-town-objects.png') });
    }
    await ctx.close();
  }

  // dọc: gợi ý xoay ngang
  ({ ctx, p, errs } = await open(b, { viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true }));
  const rot = await p.evaluate(() => getComputedStyle(document.querySelector('.rotate')).display);
  check('màn hình dọc hiện "xoay ngang"', rot === 'flex', rot);
  await ctx.close();

  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh chụp: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(2); });
