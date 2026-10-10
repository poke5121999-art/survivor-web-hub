/*
 * Sổ Tay + 154 thành tựu (sảnh bước 8, HALL.md mục 13 / 2.8): dữ liệu đủ 154 mục (tổng đá 25.666), bộ đếm chạy theo sự kiện ván
 * (phát SK.emit('enemyKill') giả lập và một lần hạ quái thật qua SK.hurtEnemy), mở thành tựu, nhận thưởng trong Sổ Tay bằng phím E thật,
 * thú cưng / ô vườn 7 mở theo thành tựu, thống kê. Ảnh chụp tự xem: $SK_SHOTS hoặc <tmp>/soulknight-ach/.
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-ach.js   (SK_URL để chạy trên Pages)
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-ach');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

const errs = [];
let browser;
// Trang mới với hồ sơ cho trước (null = hồ sơ trắng), vào sảnh → chọn Hiệp Sĩ → Bắt đầu → chế độ đi.
async function boot(profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 10000);
  await sleep(500);
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
  return p;
}
const dlgText = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
const prof = p => p.evaluate(() => ({ gems: SK.profile.gems, safe: SK.profile.safe, box: SK.profile.box, mail: SK.profile.mail, items: SK.profile.items(), stats: SK.profile.stats }));
async function closeDlg(p) {
  await p.keyboard.press('Escape');
  await until(p, () => document.getElementById('hs-modal').hidden && !document.getElementById('sk-lobby').classList.contains('only-modes'), null, 2000);
  await sleep(350);
}
// Đứng sát món (chọn ô đi được gần tâm vùng trigger nhất mà SK.hall.nearAt trả đúng món) rồi chờ khung hình cập nhật nhãn.
async function stand(p, slot) {
  const pos = await p.evaluate(slot => {
    const z = SK.hall.zones().find(q => q.slot === slot), b = z.box, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    let best = null;
    for (let dy = -3; dy <= 3; dy += 0.25) for (let dx = -3; dx <= 3; dx += 0.25) {
      const x = cx + dx, y = cy + dy;
      if (!SK.hall.walkable(x, y) || !SK.hall.walkable(x - 0.4, y) || !SK.hall.walkable(x + 0.4, y) || SK.hall.nearAt(x, y) !== slot) continue;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best) { const me = SK.hallState.me; me.x = best.x; me.y = best.y; }
    return best;
  }, slot);
  await sleep(250);
  return pos;
}
// Đứng sát món + bấm E thật; trả văn bản hộp thoại.
async function useSlot(p, slot) {
  const pos = await stand(p, slot);
  if (!pos) return null;
  await p.keyboard.press('KeyE');
  // Vừa đóng hộp thoại thì sảnh chặn E một nhịp (không mở lại ngay): chưa mở thì bấm lại (máy chậm có thể cần vài lần).
  for (let i = 0; i < 4 && !await until(p, () => !document.getElementById('hs-modal').hidden, null, 1200); i++) await p.keyboard.press('KeyE');
  await until(p, () => !document.getElementById('hs-modal').hidden, null, 2000);
  await sleep(150);
  return dlgText(p);
}



// Vào ván thật qua cửa sảnh → bảng chế độ → nút bắt đầu.
async function startRun(p) {
  await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
  await p.keyboard.down('KeyW');
  await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
  await p.keyboard.up('KeyW');
  await p.click('#hs-mode-go');
  return until(p, () => SK.G.state === 'stage' && !!SK.G.player, null, 8000);
}
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});
const ach = p => p.evaluate(() => ({ done: SK.profile.ach().done, claimed: SK.profile.ach().claimed, c: SK.ach.counters(), gems: SK.profile.gems, items: SK.profile.items() }));
const fakeG = (o) => Object.assign({ mode: 'level', badass: false, t: 600, factors: [], player: { gold: 0, hero: 'knight' } }, o || {});

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 1. dữ liệu
    let p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    const d = await p.evaluate(() => {
      const L = SK_ACH.list, g = L.reduce((s, a) => s + a.awards.filter(w => w.k === 'material_gem').reduce((t, w) => t + w.n, 0), 0);
      return { n: L.length, ids: new Set(L.map(a => a.id)).size, gems: g, hdr: SK_ACH.gems, noName: L.filter(a => !a.vi).length, noIcon: L.filter(a => !a.icon).length,
        a1: L.find(a => a.id === 1), impl: L.filter(a => SK.ach.impl(a)).length, label: JSON.stringify(L).match(/\[(LOC|CFG|WIKI|ĐO|ƯỚC)/g) };
    });
    check('dữ liệu: đủ 154 mục, id khác nhau, ai cũng có tên Việt và icon', d.n === 154 && d.ids === 154 && !d.noName && !d.noIcon, JSON.stringify([d.n, d.ids, d.noName, d.noIcon]));
    check('tổng đá thưởng = 25.666', d.gems === 25666 && d.hdr === 25666, String(d.gems));
    check('mục id 1: type 1, target 100, thưởng 200 đá + vé đổi (token_weapon_none_0)', d.a1.type === 1 && d.a1.target === 100 && d.a1.awards.some(w => w.k === 'material_gem' && w.n === 200) && d.a1.awards.some(w => w.k === 'token_weapon_none_0'), JSON.stringify(d.a1.awards));
    check('chữ hiện cho người chơi không chứa nhãn nguồn', !d.label, String(d.label));
    check('có thành tựu chạy được (≥ 35) và còn lại khoá', d.impl >= 35 && d.impl < 154, 'chạy được ' + d.impl + ', khoá ' + (154 - d.impl));

    // ============ 2. hạ 100 quái (giả lập) -> id 1 mở -> Sổ Tay (phím E) nhận thưởng
    let r = await ach(p);
    check('hồ sơ trắng: chưa có thành tựu nào', Object.keys(r.done).length === 0 && r.c.kills === 0, JSON.stringify(r.done));
    await p.evaluate(() => { const G = { mode: 'level', badass: false, t: 100, player: { gold: 0 } }; for (let i = 0; i < 99; i++) SK.emit('enemyKill', G, { id: 'e_boar02' }); });
    r = await ach(p);
    check('99 quái: chưa mở thành tựu "hạ 100 quái"', !r.done[1] && r.c.kills === 99, 'kills=' + r.c.kills);
    await p.evaluate(() => SK.emit('enemyKill', { mode: 'level' }, { id: 'e_boar02' }));
    r = await ach(p);
    check('quái thứ 100: mở "Nhà Thám Hiểm Nhỏ" (id 1), chưa nhận thưởng', r.done[1] === 1 && !r.claimed[1] && r.gems === 0, JSON.stringify(r.done));
    let t = await useSlot(p, 'handbook_entry');
    check('phím E ở ô Hầm mở Sổ Tay: tab Thành Tựu, "Đã đạt 1/154"', t && /Sổ Tay Soul Knight/.test(t) && /Đã đạt\s*1\/154/.test(t) && /chờ nhận thưởng\s*1/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 160));
    await shot(p, 'handbook-ach');
    await p.evaluate(() => document.querySelector('#sk-ach [data-id="1"]').click());
    await sleep(150);
    t = await dlgText(p);
    check('chi tiết id 1: tên, mô tả, 100/100, thưởng 200 đá + vé', /Nhà Thám Hiểm Nhỏ/.test(t) && /Đánh bại 100 Quái/.test(t) && /100\/100/.test(t) && /200/.test(t) && /Thưởng:/.test(t), t.replace(/\n/g, ' | ').slice(-200));
    await shot(p, 'handbook-detail');
    await p.click('#sk-ach-claim');
    await sleep(200);
    r = await ach(p);
    const tok = await p.evaluate(() => SK_ITEMS.items.token_weapon_none_0 ? 1 : 0);
    check('Nhận: cộng đúng +200 đá và 1 vé đổi, đánh dấu đã nhận', r.gems === 200 && r.items.token_weapon_none_0 === 1 && r.claimed[1] === 1 && tok === 1, 'gems=' + r.gems + ' items=' + JSON.stringify(r.items));
    t = await dlgText(p);
    check('thông báo nhận thưởng và không còn nút Nhận', /Đã nhận thưởng/.test(t) && !await p.evaluate(() => !!document.getElementById('sk-ach-claim')), t.replace(/\n/g, ' | ').slice(-120));
    await p.click('#sk-ach-claim').catch(() => {});
    r = await ach(p);
    check('nhận lần hai không cộng thêm', r.gems === 200 && r.items.token_weapon_none_0 === 1);
    await p.click('#sk-hb-tab-stat');
    await sleep(150);
    t = await dlgText(p);
    check('tab Thống kê: số quái 100, thành tựu 1/154', /Tổng số địch đánh bại\s*100/.test(t) && /Thành tựu đã đạt\s*1\/154/.test(t), t.replace(/\n/g, ' | '));
    await shot(p, 'handbook-stat');
    await closeDlg(p);
    // lưu bền: nạp lại trang vẫn còn
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('sk.profile.v1')).ach);
    check('hồ sơ lưu done/claimed/bộ đếm', saved.done[1] === 1 && saved.claimed[1] === 1 && saved.c.kills === 100, JSON.stringify(saved).slice(0, 100));
    await p.context().close();

    // ============ 3. loại khác: vượt ải, thời gian, mua tiệm 30 lần -> thú cưng mở
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    check('thú cưng pet36 (Giảm 10%) mở bằng thành tựu: lúc đầu chưa có', await p.evaluate(() => !SK.profile.petOwned('pet36') && SK_PETS.pets.pet36.unlock.kind === 'achievement' && SK_ACH.pets.pet36 === 106));
    await p.evaluate(() => { for (let i = 0; i < 29; i++) SK.emit('shopBuy', {}, { kind: 'buff', id: 'x', price: 1 }); });
    check('29 lần mua: pet36 vẫn khoá', await p.evaluate(() => !SK.profile.petOwned('pet36') && !SK.ach.done(106)));
    await p.evaluate(() => SK.emit('shopBuy', {}, { kind: 'buff', id: 'x', price: 1 }));
    check('mua đủ 30 lần: thành tựu "Sự Nghiệp Hưng Thịnh" mở và pet36 thành "đã có"', await p.evaluate(() => SK.ach.done(106) && SK.profile.petOwned('pet36')));
    check('bảng thú cưng hiện pet36 "Đã có"', await (async () => {
      await p.evaluate(() => SK.profile.setPet('pet36'));
      const t2 = await useSlot(p, 'pet_food');
      const ok = await p.evaluate(() => { const el = document.querySelector('#sk-pets [data-id="pet36"]'); return !!el && !el.classList.contains('lk') && /Đã có|Đang chọn/.test(el.innerText); });
      await closeDlg(p); return ok && !!t2;
    })());
    // vượt Ải-Thường nhanh, Lợi Hại, thiên phú, nhân tố
    await p.evaluate(() => {
      const base = { mode: 'level', badass: false, t: 19 * 60, factors: ['f1', 'f2'], player: { gold: 850 } };
      SK.emit('pickup', base, 'coin');
      for (let i = 0; i < 20; i++) SK.emit('buffTake', base, 'buff_' + i);
      SK.emit('runEnd', base, { won: true, stage: '3-5', kills: 10, gold: 850 });
      SK.emit('runEnd', Object.assign({}, base, { badass: true, t: 22 * 60 }), { won: true, stage: '3-5', kills: 10, gold: 5 });
      SK.emit('runEnd', { mode: 'bossrush', badass: false, t: 9 * 60, factors: [], player: { gold: 0 } }, { won: true, stage: '3-5', kills: 10, gold: 0 });
    });
    r = await ach(p);
    const ids = await p.evaluate(() => Object.keys(SK.profile.ach().done).map(Number).sort((a, b) => a - b));
    check('sau vượt Thường/Lợi Hại, 800 vàng, 20 thiên phú, Khu Thí Luyện, nhanh 20/23/10 phút: mở 7, 8, 14, 16, 17, 32, 34, 61, không mở 4 (vượt 5 lần)', [7, 8, 14, 16, 17, 32, 34, 61].every(id => ids.includes(id)) && !ids.includes(4), ids.join(','));
    await p.context().close();

    // ============ 4. ô vườn 7 mở theo thành tựu "Tường Than Thở" (id 42)
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    check('ô vườn 7 khoá lúc đầu, cần thành tựu id 42', await p.evaluate(() => !SK.garden.state().open[6] && SK_GARDEN.plots[6].kind === 'achievement' && SK_GARDEN.plots[6].ac === 42));
    check('ô vườn 7: tên ô có "(khóa)" ở sảnh', await p.evaluate(() => /khóa/.test(SK.hall.zones().find(z => z.slot === 'garden_plot_6').name)));
    await p.evaluate(() => SK.ach.grant(42));
    check('đạt thành tựu 42: ô vườn 7 mở', await p.evaluate(() => SK.garden.state().open[6] === true && !/khóa/.test(SK.hall.zones().find(z => z.slot === 'garden_plot_6').name)));
    check('ô vườn 7 mở là bền: lưu trong hồ sơ', await p.evaluate(() => JSON.parse(localStorage.getItem('sk.profile.v1')).garden.open[6] === true));
    await p.context().close();

    // ============ 5. ván thật: hạ quái bằng SK.hurtEnemy phát đúng enemyKill, thống kê ghi Thủ Lĩnh
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    check('vào ván thật', await startRun(p));
    const k0 = (await ach(p)).c.kills;
    await p.evaluate(() => { const G = SK.G; SK_GAME.debug.god(true); const e = SK.makeEnemy(G, 'e_boar02', G.player.x + 20, G.player.y, G.room); e.st = 'idle'; e.stT = 0; G.enemies.push(e); SK.hurtEnemy(G, e, 99999, false, 0, 0); });
    r = await ach(p);
    check('quái chết thật trong ván: bộ đếm tăng 1 và đếm theo loại', r.c.kills === k0 + 1 && r.c.by.e_boar02 === 1, JSON.stringify(r.c.by));
    await p.evaluate(() => SK.emit('skill', SK.G, SK.G.player));
    r = await ach(p);
    check('dùng kỹ năng thật được đếm theo nhân vật (knight = chỉ số 0)', r.c.skill['0'] === 1, JSON.stringify(r.c.skill));
    await p.context().close();
  } catch (e) { check('chạy bộ kiểm không lỗi', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : String(e)); }
  await browser.close();
  console.log(out.join('\n'));
  const real = errs.filter(e => !/favicon|net::ERR/.test(e) && !/js\/matrix\.js|Failed to load resource/.test(e))   // matrix.js: tệp của agent Mê Trận đang dựng, ngoài phạm vi bộ kiểm này;
  check('không lỗi trang / console', real.length === 0, real.slice(0, 3).join(' | '));
  console.log(out[out.length - 1]);
  console.log('\n' + (fail ? 'HỎNG ' + fail : 'HỎNG 0') + ' · ĐẠT ' + pass);
  process.exit(fail ? 1 : 0);
})();
