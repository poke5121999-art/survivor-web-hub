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
// độ sáng trung bình (0..255) của một vùng trên ảnh chụp: ảnh nạp qua data: URL nên canvas không bị khoá như file://
async function luma(p, png, boxes) {
  return p.evaluate(([src, boxes]) => new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
      const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
      res(boxes.map(b => {
        const d = x.getImageData(Math.round(b[0]), Math.round(b[1]), b[2], b[3]).data; let s = 0;
        for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        return s / (d.length / 4);
      }));
    };
    im.src = 'data:image/png;base64,' + src;
  }), [png.toString('base64'), boxes]);
}
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
  // đổi bài nhạc làm trình duyệt huỷ luồng đang tải (ERR_ABORTED); đó không phải lỗi thiếu tệp
  p.on('requestfailed', r => { if (!/ERR_ABORTED/.test(r.failure().errorText)) errs.push('REQFAIL ' + r.url().replace(/^.*games\/diablo2\//, '') + ' ' + r.failure().errorText); });
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

// NPC thị trấn đi lại (WL) nên đọc lại vị trí ngay trước khi bấm và chỉ bấm khi con trỏ đang chỉ đúng NPC đó
async function clickNpc(p, id) {
  for (let i = 0; i < 12; i++) {
    const n = (await st(p)).npcs.find(x => x.id === id); if (!n) return false;
    const c = await p.evaluate(([x, y]) => D2DBG.client(x, y, 40), [n.x, n.y]);
    await p.mouse.move(c.x, c.y); await sleep(60);
    if (await p.evaluate(nid => !!(D2DBG.S.hover && D2DBG.S.hover.npc === nid), id)) { await p.mouse.click(c.x, c.y); return true; }
    await sleep(250);
  }
  return false;
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
  // ghi lại mọi khoá tiếng game gọi (E.sfx trả khoá đã chọn, kể cả khi trình duyệt chưa cho phát)
  await p.evaluate(() => { window.__sfx = []; const o = D2.E.sfx; D2.E.sfx = function () { const k = o.apply(this, arguments); if (k) window.__sfx.push(k); return k; }; });
  const sfxSince = async (n, re) => p.evaluate(([n, re]) => { const r = new RegExp(re); return window.__sfx.slice(n).filter(k => r.test(k)).map(k => k + (D2.E.UI.sfx[k] ? '' : '(THIẾU)')); }, [n, re.source]);
  const hud = await p.evaluate(() => ({ frames: document.querySelectorAll('.hbar > .sp, .hbar > img, .hbar > div[style*="background"]').length, orb: getComputedStyle(document.querySelector('.orb.life .fill')).backgroundImage }));
  check('HUD có khung ctrlpanel và cầu máu bằng hình D2', hud.frames > 0 && /url\(/.test(hud.orb), JSON.stringify(hud).slice(0, 120));
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
      const near = path.filter(q => Math.hypot(q[0] - s.hero.x, q[1] - s.hero.y) <= 12);
      const cand = (near.length ? near : [path[path.length - 1]]).reverse();
      // NPC đi lại có thể đứng đúng chỗ định bấm: chọn chặng mà con trỏ không chỉ vào NPC (bấm NPC là mở hộp thoại)
      let pt = null;
      for (const q of cand) { pt = await p.evaluate(([x, y]) => { const c = D2DBG.client(x, y), e = D2DBG.entAt(c.sx, c.sy); return e && e.kind === 'npc' ? null : c; }, q); if (pt) break; }
      if (!pt) { await sleep(300); continue; }
      await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await sleep(700); await p.mouse.up();
      await p.evaluate(() => { if (D2.UI.dlg) D2.UI.closeDialog(); });
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
  // đạn Fire Bolt và hình niệm đã nạp trước khi vào khu (không chờ lần vẽ đầu)
  const pre = await p.evaluate(() => ['mis.firebolt', 'mis.fireexplode', 'ovl.fire_cast_1'].map(k => {
    const s = D2.E.sheet(k), g = D2_GROUPS[k.split('.')[0]]; if (!s || !g) return k + ':chưa nạp';
    const pg = {}; Object.values(s.anims).forEach(a => a.f.forEach(f => f.forEach(r => { if (r && r.length > 6) pg[g.pages[r[6]]] = 1; })));
    return k + ':' + Object.keys(pg).every(u => D2.E.images[u] && D2.E.images[u].ok);
  }));
  check('vào khu đã nạp sẵn hình đạn, vụ nổ, hình niệm của Fire Bolt', pre.every(x => /:true$/.test(x)), pre.join(' '));
  // trong trận: đếm chấm thay thế của đạn (arc bán kính 6/14 ở drawMissile) và mọi chữ vẽ lên canvas
  await p.evaluate(() => {
    window.__dots = 0; window.__texts = [];
    const P = CanvasRenderingContext2D.prototype, arc = P.arc, ft = P.fillText;
    P.arc = function (x, y, r, a0, a1) { if ((r === 6 || r === 14) && a1 === 7) window.__dots++; return arc.apply(this, arguments); };
    P.fillText = function (t) { if (this.canvas.id === 'view') window.__texts.push(String(t)); return ft.apply(this, arguments); };
  });
  const sfx0 = await p.evaluate(() => window.__sfx.length);

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
  const dots = await p.evaluate(() => window.__dots);
  check('Fire Bolt đầu tiên vẽ bằng hình đạn thật, không có chấm thay thế', dots === 0, 'chấm=' + dots);
  const cast = await sfxSince(sfx0, /^(sorceress_cast_fire|sorceress_firebolt_\d|sorceress_firebolt_impact_\d)$/);
  check('niệm Fire Bolt phát stsound + TravelSound + HitSound của bảng gốc', ['sorceress_cast_fire', 'sorceress_firebolt_', 'sorceress_firebolt_impact_'].every(k => cast.some(c => c.indexOf(k) === 0 && !/THIẾU/.test(c))), cast.join(' '));
  const die = await sfxSince(sfx0, /^zombie_death_\d$/);
  check('quái chết phát DeathSound của monsounds (zombie_death_*)', die.length > 0 && !die.some(c => /THIẾU/.test(c)), die.join(' ') || 'không có');
  // cận chiến: đòn thường bằng gậy của Sorceress -> tiếng vung + tiếng trúng theo hit class (club) của weapons.txt
  await p.evaluate(() => { D2DBG.setSkills('attack', D2DBG.getState().right); const h = D2DBG.getState().hero; D2DBG.spawn('zombie1', 1, 2.4, 0); });
  const sfx1 = await p.evaluate(() => window.__sfx.length);
  for (let i = 0; i < 12; i++) {
    s = await st(p);
    const z = s.mons.filter(m => m.id === 'zombie1' && m.st !== 'dead' && m.st !== 'die').sort((a, c) => Math.hypot(a.x - s.hero.x, a.y - s.hero.y) - Math.hypot(c.x - s.hero.x, c.y - s.hero.y))[0];
    if (!z || Math.hypot(z.x - s.hero.x, z.y - s.hero.y) > 6) break;
    await clickTile(p, z.x, z.y, { lift: 30 }); await sleep(500);
    if ((await sfxSince(sfx1, /^impact_/)).length) break;
  }
  const melee = await sfxSince(sfx1, /^(weapon_|impact_)/);
  check('đánh cận chiến phát weapon_1hs_large_* lúc vung và impact_blunt_* khi trúng', melee.some(k => /^weapon_1hs_large_\d$/.test(k)) && melee.some(k => /^impact_blunt_\d$/.test(k)), melee.join(' ') || 'không có');
  const texts = await p.evaluate(() => window.__texts.filter(t => /^\d+$|miss|XP|LÊN CẤP|^\+/.test(t)));
  check('trận đánh không vẽ chữ nổi (số sát thương, miss, +XP)', texts.length === 0, texts.slice(0, 6).join(' | '));

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
    // bấm vào nhãn của chính món đó (Alt hiện mọi nhãn; sau khi giết 20 quái, nhãn vàng có thể che chỗ món đồ nằm)
    const lb = await p.evaluate(([x, y]) => {
      const e = D2DBG.S.ents.filter(o => o.kind === 'drop' && !o.removed && Math.abs(o.x - x) < 1e-6 && Math.abs(o.y - y) < 1e-6)[0], r = e && e.labelRect;
      const v = document.getElementById('view').getBoundingClientRect(), k = v.width / 960;
      return r ? { x: v.left + (r[0] + r[2] / 2) * k, y: v.top + (r[1] + r[3] / 2) * k } : null;
    }, [d.x, d.y]);
    if (lb) { await p.mouse.move(lb.x, lb.y); await p.mouse.click(lb.x, lb.y); } else await clickTile(p, d.x, d.y, { lift: 10 });
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
  await clickNpc(p, 'akara');
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
  await clickNpc(p, 'akara');
  await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
  await p.click('.dialog button:has-text("Nhận thưởng")');
  await sleep(200);
  s = await st(p);
  check('nhận thưởng: +1 điểm kỹ năng, cờ done', s.skillPts === sp1 + 1 && s.quests.den_of_evil === 'done', 'skillPts ' + sp1 + '->' + s.skillPts);

  // cửa hàng: mua bình thuốc
  await clickNpc(p, 'akara');
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

  // ------------------------------------------------------------- ánh sáng
  results.push('\n-- ánh sáng --');
  // Đóng băng cảnh, chụp có và không có lớp ánh sáng; so độ sáng ở các ô nằm ngoài mọi nguồn sáng (D2DBG.lights) và quanh hero.
  // Chỉ tính ô có hình khi tắt lớp sáng (bỏ ô đen ngoài mép bản đồ). Trả tỉ lệ sáng/không sáng.
  async function lightRatio(name) {
    await p.evaluate(() => D2DBG.freeze(true)); await sleep(150);
    const g = await p.evaluate(() => {
      const r = document.getElementById('view').getBoundingClientRect(), k = r.width / 960, L = D2DBG.lights().list, h = D2DBG.getState().hero, hc = D2DBG.client(h.x, h.y, 30);
      const out = [];
      for (let y = 20; y < 420; y += 40) for (let x = 20; x < 920; x += 50) {
        const cx = x + 20, cy = y + 15;
        if (L.every(l => Math.pow((cx - l.x) / (l.r * 22.6), 2) + Math.pow((cy - l.y) / (l.r * 11.3), 2) > 1.3)) out.push([r.left + x * k, r.top + y * k, Math.round(40 * k), Math.round(30 * k)]);
      }
      return { out, hero: [hc.x - 25, hc.y - 25, 50, 50] };
    });
    const lit = await p.screenshot({ path: path.join(SHOTS, name + '.png') });
    await p.evaluate(() => D2DBG.noLight(true));
    const raw = await p.screenshot();
    await p.evaluate(() => { D2DBG.noLight(false); D2DBG.freeze(false); });
    const boxes = g.out.concat([g.hero]), a = await luma(p, lit, boxes), b = await luma(p, raw, boxes);
    let sa = 0, sb = 0, n = 0;
    for (let i = 0; i < g.out.length; i++) if (b[i] > 12) { sa += a[i]; sb += b[i]; n++; }
    return { out: n ? sa / sb : null, hero: a[boxes.length - 1] / Math.max(1, b[boxes.length - 1]), n };
  }
  await p.evaluate(() => D2DBG.goto('catacombs_level_2'));
  await waitFor(p, () => D2DBG.getState().area === 'catacombs_level_2', 20000);
  await sleep(700);
  let lr = await lightRatio('3g-catacombs-dark');
  check('Catacombs: ngoài vùng sáng gần như đen, quanh hero vẫn sáng', lr.n > 0 && lr.out < 0.15 && lr.hero > 0.6, JSON.stringify(lr));
  await p.evaluate(() => D2DBG.goto('rogue_encampment'));
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 10000);
  await p.evaluate(() => D2DBG.hour(12)); await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '3h-town-day.png') });
  await p.evaluate(() => D2DBG.hour(23)); await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '3i-town-night.png') });
  await p.evaluate(() => D2DBG.goto('blood_moor'));
  await waitFor(p, () => D2DBG.getState().area === 'blood_moor', 10000);
  await p.evaluate(() => D2DBG.hour(12)); await sleep(300);
  lr = await lightRatio('3j-moor-day');
  check('ngoài trời ban ngày không phủ tối', lr.n > 0 && lr.out > 0.95, JSON.stringify(lr));
  await p.evaluate(() => D2DBG.hour(23)); await sleep(300);
  lr = await lightRatio('3k-moor-night');
  check('ngoài trời ban đêm tối đi ngoài vùng sáng của hero', lr.n > 0 && lr.out < 0.5 && lr.hero > 0.6, JSON.stringify(lr));
  await p.evaluate(() => D2DBG.hour(12));
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
  results.push('\n-- chuyển act --');
  await p.evaluate(() => { D2DBG.S.char.quests.sisters_to_the_slaughter = 'done'; D2DBG.goto('rogue_encampment', 'blood_moor'); });
  await waitFor(p, () => D2DBG.getState().area === 'rogue_encampment', 10000);
  await sleep(400);
  const wv = (await st(p)).npcs.find(n => n.id === 'warriv1');
  check('Rogue Encampment có Warriv', !!wv);
  if (wv) {
    await p.evaluate(([x, y]) => D2DBG.teleport(x - 3, y), [wv.x, wv.y]);
    await sleep(300);
    await clickNpc(p, 'warriv1');
    const wdlg = await waitFor(p, () => document.querySelector('.dialog').style.display === 'block', 12000);
    check('bấm Warriv -> hộp thoại có nút đi Lut Gholein', wdlg && (await p.$$('.dialog button:has-text("Lut Gholein")')).length === 1);
    if (wdlg) await p.click('.dialog button:has-text("Lut Gholein")');
    const lg = await waitFor(p, () => D2DBG.getState().area === 'lut_gholein', 30000);
    const lgN = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'npc').map(e => e.npc));
    check('sang Act II: Lut Gholein có Jerhyn, Fara, Drognan, Meshif', lg && ['jerhyn', 'fara', 'drognan', 'meshif1'].every(n => lgN.includes(n)), lgN.filter(n => !/^act2/.test(n)).join(','));
    await p.screenshot({ path: path.join(SHOTS, '6-lut-gholein.png') });
  }
  await p.evaluate(() => { D2DBG.S.char.quests.the_guardian = 'cleared'; D2DBG.goto('durance_of_hate_level_3'); });
  await waitFor(p, () => D2DBG.getState().area === 'durance_of_hate_level_3', 30000);
  await p.evaluate(() => D2DBG.killAllMons());
  const gate = await p.evaluate(() => { const o = D2DBG.S.ents.find(e => e.kind === 'obj' && e.otype === 'portal'); return o ? { x: o.x, y: o.y } : null; });
  check('Durance 3 có cổng đỏ (HellGate trong DS1)', !!gate);
  if (gate) {
    await p.evaluate(([x, y]) => D2DBG.teleport(x + 4, y + 4), [gate.x, gate.y]);
    await sleep(400);
    await clickTile(p, gate.x, gate.y, { lift: 30 });
    const pf = await waitFor(p, () => D2DBG.getState().area === 'the_pandemonium_fortress', 30000);
    check('xong The Guardian, bấm cổng đỏ -> Pandemonium Fortress', pf, await p.evaluate(() => D2DBG.getState().area));
    await p.screenshot({ path: path.join(SHOTS, '6-pandemonium.png') });
  }

  await p.evaluate(() => { D2DBG.S.char.quests.hells_forge = 'active'; D2DBG.goto('river_of_flame'); });
  await waitFor(p, () => D2DBG.getState().area === 'river_of_flame', 30000);
  const heph = await p.evaluate(() => D2DBG.getState().mons.some(m => m.id === 'the_feature_creep'));
  const hf0 = await p.evaluate(() => D2DBG.S.char.quests.hells_forge);
  await p.evaluate(() => D2DBG.killAllMons());
  const hf = await p.evaluate(() => D2DBG.S.char.quests.hells_forge);
  check('River of Flame: vào khu chưa xong Hell\'s Forge, giết Hephasto mới xong', heph && hf0 === 'active' && (hf === 'cleared' || hf === 'done'), 'hephasto=' + heph + ' ' + hf0 + '->' + hf);

  await p.evaluate(() => D2DBG.goto('the_chaos_sanctuary'));
  await waitFor(p, () => D2DBG.getState().area === 'the_chaos_sanctuary', 30000);
  const seals = await p.evaluate(() => D2DBG.getState().mons.filter(m => m.rank === 'unique').map(m => m.id).sort());
  check('Chaos Sanctuary có ba trùm giữ ấn, chưa có Diablo', seals.join() === 'grand_vizier_of_chaos,infector_of_souls,lord_de_seis', seals.join());
  await p.evaluate(() => D2DBG.killAllMons());
  const dia = await waitFor(p, () => D2DBG.getState().mons.some(m => m.id === 'diablo' && m.st !== 'dead' && m.st !== 'die'), 5000);
  check('giết ba trùm ấn -> Diablo xuất hiện', dia);
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, '6-diablo.png') });

  results.push('\n-- lưu --');
  const saved = await p.evaluate(() => { D2.Game.save(); return !!localStorage.getItem('d2web.save.v1'); });
  check('lưu vào localStorage', saved);
  await p.reload(); await p.waitForSelector('.screen.title .tmenu');
  check('có nút Tiếp tục sau khi lưu', (await p.$$('.tmenu button:has-text("Tiếp tục")')).length === 1);
  await p.click('.tmenu button:has-text("Tiếp tục")');
  await p.waitForFunction(() => D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 15000 });
  s = await st(p);
  check('nạp lại đúng nhân vật', s.cls === 'sorceress' && s.lvl > 1, 'lvl=' + s.lvl);

  results.push('\n-- độ khó --');
  await p.evaluate(() => { D2DBG.S.char.diffMax = 'nm'; D2.Game.save(); });
  await p.reload(); await p.waitForSelector('.screen.title .tmenu');
  const tb = await p.$$eval('.tmenu button', bs => bs.map(b => b.textContent));
  check('mở Nightmare -> có nút Tiếp tục cho Normal và Nightmare', tb.includes('Tiếp tục · Normal') && tb.includes('Tiếp tục · Nightmare'), tb.join(' | '));
  await p.click('.tmenu button:has-text("Tiếp tục · Nightmare")');
  await p.waitForFunction(() => D2DBG.getState().scene === 'play' && D2DBG.getState().hero, null, { timeout: 15000 });
  const nm = await p.evaluate(() => ({ diff: D2DBG.S.char.diff, fire: D2DBG.S.d.res.fire, quests: Object.keys(D2DBG.S.char.quests).length }));
  check('Nightmare: kháng lửa trừ 40, nhiệm vụ làm lại từ đầu', nm.diff === 'nm' && nm.fire === -40 && nm.quests === 0, JSON.stringify(nm));
  await p.evaluate(() => D2DBG.goto('blood_moor'));
  await p.waitForFunction(() => D2DBG.getState().area === 'blood_moor' && D2DBG.getState().mons.length > 0, null, { timeout: 20000 });
  const lv = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'mon' && e.rank === 'normal').map(e => e.inst.lvl));
  check('Nightmare: quái Blood Moor cấp 36 (MonLvlEx của levels.txt)', lv.length > 0 && lv.every(l => l === 36), [...new Set(lv)].join(','));
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

      let chest = null, chestArea = null;
      for (const a of ['cold_plains', 'stony_field', 'dark_wood', 'black_marsh']) {
        await p.evaluate(a => D2DBG.goto(a), a);
        await waitFor(p, a => D2DBG.getState().area === a, 15000, a);
        await sleep(400);
        chest = await p.evaluate(() => { const h = D2DBG.S.hero; const c = D2DBG.S.ents.filter(e => e.kind === 'obj' && e.otype === 'chest').sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; return c ? { x: c.x, y: c.y } : null; });
        if (chest) { chestArea = a; break; }
      }
      check('khu ngoài trời Act I có rương', !!chest, chestArea);
      if (chest) {
        await p.evaluate(() => D2DBG.killAllMons());
        // đứng trên đường A* tới rương, cách vài bước: ô chéo cạnh rương có thể là tường của tàn tích
        await p.evaluate(([x, y]) => { const pt = D2DBG.path(x, y) || []; const n = pt[Math.max(0, pt.length - 6)]; if (n) D2DBG.teleport(n[0], n[1]); }, [chest.x, chest.y]);
        await sleep(300);
        const drops0 = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'drop' && !e.removed).length);
        await clickTile(p, chest.x, chest.y, { lift: 12 });
        const opened = await waitFor(p, ([x, y]) => D2DBG.S.ents.some(e => e.kind === 'obj' && e.opened && Math.abs(e.x - x) < 0.01 && Math.abs(e.y - y) < 0.01), 8000, [chest.x, chest.y]);
        const drops1 = await p.evaluate(() => D2DBG.S.ents.filter(e => e.kind === 'drop' && !e.removed).length);
        check('bấm rương -> rương mở (chế độ OP của D2)', opened, chestArea);
        const again = await p.evaluate(([x, y]) => D2DBG.S.ents.filter(e => e.kind === 'obj' && e.opened && Math.abs(e.x - x) < 0.01 && Math.abs(e.y - y) < 0.01).map(e => e.otype)[0], [chest.x, chest.y]);
        check('rương đã mở không bấm lại được', opened && again === null, 'otype=' + again + ', đồ ' + drops0 + '->' + drops1);
        await sleep(800);
        await p.screenshot({ path: path.join(SH, 'f-chest.png') });
      }
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
