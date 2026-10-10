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

    // ============ 6. đợt 2: thành tựu mở nhờ cơ chế đã có (mọi sự kiện do hàm game sinh ra, không tự SK.emit)
    const NEW = [9, 10, 11, 28, 29, 30, 31, 39, 40, 41, 42, 74, 87, 89, 99, 124, 125, 126, 140, 141, 142, 145, 146, 157];
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    const impl6 = await p.evaluate(ids => ({ on: ids.filter(id => SK.ach.impl(id)).length, lockedKeep: [65, 66, 143, 144, 147, 75, 76, 12, 36].filter(id => !SK.ach.impl(id)).length }), NEW);
    check('24 thành tựu đợt 2 tính được, các mục còn thiếu cơ chế (câu cá, nâng thiên phú Hư Không, Tàu Ngoài Hành Tinh...) vẫn khoá', impl6.on === 24 && impl6.lockedKeep === 9, JSON.stringify(impl6));
    const D6 = (id) => p.evaluate(i => SK.ach.done(i), id);
    const doneOf = ids => p.evaluate(l => l.filter(i => SK.ach.done(i)), ids);
    const prog = id => p.evaluate(i => SK.ach.progress(i), id);

    // ---- 6a. Cảnh Sát treo thưởng: nhận qua hàm quest.claim thật (phát 'bounty'), 1 / 10 lần
    await p.evaluate(() => { const Q = SK.hallExt.quest; Q.sync(); Q.accept(0); Q.sync(); SK.hallExt.quest.sync(); });
    const bounty1 = await p.evaluate(() => {
      const Q = SK.hallExt.quest, q = Q.sync(); q.active.done = true; const r = Q.claim();
      return { ok: !!r, done9: SK.ach.done(9), done10: SK.ach.done(10), c: SK.ach.counters().bounty };
    });
    check('treo thưởng: nhận thưởng 1 lần mở "Thợ Săn Tiền Thưởng Nhỏ Bé" (id 9), chưa mở id 10', bounty1.ok && bounty1.done9 && !bounty1.done10 && bounty1.c === 1, JSON.stringify(bounty1));
    const bounty10 = await p.evaluate(() => {
      const Q = SK.hallExt.quest;
      for (let i = 0; i < 9; i++) { const q = Q.sync(); if (!q.active) Q.accept(0); Q.sync().active.done = true; Q.claim(); }
      return { done10: SK.ach.done(10), done11: SK.ach.done(11), c: SK.ach.counters().bounty, pg: SK.ach.progress(11) };
    });
    check('10 lần nhận: mở id 10, chưa mở id 11 (100 lần), tiến độ 10/100', bounty10.done10 && !bounty10.done11 && bounty10.c === 10 && bounty10.pg.cur === 10 && bounty10.pg.max === 100, JSON.stringify(bounty10));
    const rw9 = await p.evaluate(() => { const r = SK.ach.claim(9); return { ok: r.ok, seed: SK.profile.items().plant_banboo_seed | 0 }; });
    check('thưởng id 9 (hạt giống tre) cộng thật vào kho', rw9.ok && rw9.seed === 1, JSON.stringify(rw9));
    const rw10 = await p.evaluate(() => { const r = SK.ach.claim(10); return { r, seed: SK.profile.items().plant_magic_flower_seed | 0 }; });
    check('thưởng id 10: hạt giống cộng thật, skin nhân vật chưa có đích nhận thì bỏ qua đúng 1 phần (không cộng giả)', rw10.r.ok && rw10.seed === 1 && rw10.r.skipped === 1, JSON.stringify(rw10));
    await p.context().close();

    // ---- helpers ván thật
    async function launch(p, hero, mode, setup) {
      await p.evaluate(([h, m]) => { try { SK.lobby.enter(); } catch (e) { /* đã ở sảnh */ } SK_GAME.debug.seed(31); SK.lobby.launch(h, m, []); }, [hero, mode]);
      const ok = await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play' && !!SK.G.player, null, 12000);
      await p.evaluate(() => { SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
      return ok;
    }
    // thắng thật: tới ải cuối, vào phòng Thủ Lĩnh, dọn phòng, bước vào cổng (hold -> chọn buff 1)
    async function winReal(p, slowSecs) {
      await p.evaluate(() => { SK_GAME.debug.god(true); SK_GAME.debug.stage(SK.STAGES[SK.STAGES.length - 1].label); });
      await until(p, () => SK_GAME.phase === 'play', null, 8000);
      await p.evaluate(() => { SK_GAME.debug.god(true); SK_GAME.debug.teleportTo('boss'); });
      await until(p, () => SK_GAME.rooms.some(r => r.type === 'boss' && r.state === 'locked'), null, 8000);
      if (slowSecs) await p.evaluate(s => { SK.G.t += s; }, slowSecs);
      await p.evaluate(() => SK_GAME.debug.clearRoom());
      await until(p, () => !!SK.G.portal, null, 8000);
      await p.evaluate(() => { const G = SK.G; G.player.x = G.portal.x; G.player.y = G.portal.y; });
      for (let i = 0; i < 80; i++) {
        if (await p.evaluate(() => SK.G.hold && SK_ROOMS.pick(0))) await sleep(50);
        if (await p.evaluate(() => SK_GAME.state === 'victory')) return true;
        await sleep(120);
      }
      return false;
    }
    const heroByIdx = i => p.evaluate(i => Object.keys(SK.D.heroes).find(k => SK.D.heroes[k].s0.index === i), i);

    // ---- 6b. thí luyện nhân vật + không dùng vũ khí + thú cưỡi, qua ván thắng thật
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    const H = { robot: await heroByIdx(12), bers: await heroByIdx(13), holy: await heroByIdx(7) };
    check('tìm được nhân vật theo chỉ số (Robot 12, Berserker 13, Kỵ Sĩ Thánh 7)', !!(H.robot && H.bers && H.holy), JSON.stringify(H));
    check('ván Robot mở được', await launch(p, H.robot, 'level'));
    await p.evaluate(() => { const G = SK.G; SK.mountOn(G, G.player, 'm_mech_0'); });   // cơ giáp không tính là "thú cưỡi" của id 125
    check('ván Robot thắng thật, runEnd báo won', await winReal(p) && await p.evaluate(() => SK.G.state === 'victory'));
    let d6 = await doneOf(NEW);
    check('Robot thắng Ải-Thường không mất HP, không bắn: mở 29 (Thí Luyện Nhanh Nhẹn) và 30 (Trảm Vô Hình); không mở 28, 31 (sai nhân vật / Lợi Hại), 125 (cưỡi cơ giáp)',
      d6.includes(29) && d6.includes(30) && !d6.includes(28) && !d6.includes(31) && !d6.includes(125), JSON.stringify(d6));

    check('ván Berserker (Lợi Hại, Thủ Lĩnh chậm hơn 90 giây, cưỡi heo rừng) mở được', await launch(p, H.bers, 'level'));
    await p.evaluate(() => { const G = SK.G; G.badass = true; SK.mountOn(G, G.player, 'mboar'); });
    check('ván Berserker thắng thật', await winReal(p, 100));
    d6 = await doneOf(NEW);
    check('Thủ Lĩnh quá 90 giây: không mở 28; Lợi Hại không bắn: mở 31 (Trảm! Thứ! Nguyên!); cưỡi heo rừng vượt ải: mở 125 (Thúc Ngựa Phi)',
      !d6.includes(28) && d6.includes(31) && d6.includes(125), JSON.stringify(d6));
    await p.evaluate(() => SK.G.mercs && 0);

    check('ván Berserker nhanh mở được', await launch(p, H.bers, 'level'));
    check('ván Berserker nhanh thắng thật', await winReal(p));
    d6 = await doneOf(NEW);
    check('Thủ Lĩnh trong 90 giây: mở 28 (Thí Luyện Tốc Độ)', d6.includes(28), JSON.stringify(d6));

    // Khu Thí Luyện + Nhân Tố + Kỵ Sĩ Thánh
    await p.evaluate(h => { try { SK.lobby.enter(); } catch (e) { /* sảnh */ } SK_GAME.debug.seed(31); SK.lobby.launch(h, 'bossrush', ['Tiny']); }, H.holy);
    check('ván Khu Thí Luyện (Kỵ Sĩ Thánh + Nhân Tố) mở được', await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play' && SK.G.mode === 'bossrush' && (SK.G.factors || []).length > 0, null, 12000));
    await p.evaluate(() => SK_GAME.debug.god(true));
    check('Khu Thí Luyện thắng thật', await winReal(p));
    d6 = await doneOf(NEW);
    check('Kỵ Sĩ Thánh có Nhân Tố vượt Khu Thí Luyện không chết: mở 39 (Ku)', d6.includes(39), JSON.stringify(d6));
    await p.context().close();

    // ---- 6c. tầng 4 (id 99): vào ải 4 thật qua cổng tím của Kẻ Vượt Ranh Giới: dùng enterStage thật tới 4-1
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    check('ván Ải mở được', await launch(p, 'knight', 'level'));
    const f4a = await p.evaluate(() => { SK.floor4.extend(SK.STAGES); SK_GAME.debug.stage('3-5'); return SK.ach.done(99); });
    check('3-5 chưa mở id 99', !f4a);
    await p.evaluate(() => SK_GAME.debug.stage('4-1'));
    await until(p, () => SK_GAME.stage === '4-1', null, 6000);
    check('vào ải 4-1 (stageEnter của game): mở "Thế giới mới!" (id 99)', await D6(99));

    // ---- 6d. tùy tùng: Thầy Huấn Luyện nâng đủ bậc (id 124), tùy tùng + thú cưng = 6 (id 126)
    await p.evaluate(() => { Object.assign(SK_ROOMS.force, { chest: null, special: 'trainer', statue: null, merc: null }); SK_GAME.debug.stage('1-3'); });
    await until(p, () => SK_GAME.phase === 'play', null, 6000);
    await p.evaluate(() => { SK_GAME.debug.god(true); SK_GAME.debug.teleportTo('special'); });
    await sleep(350);
    await p.evaluate(() => { const G = SK.G, pl = G.player; SK.addMercenary(G, pl, 'npc_02', pl.x - 8, pl.y, { hired: true, armed: true, hpBonus: 0 }); });
    for (let k = 1; k <= 5; k++) {
      await p.evaluate(() => { SK.G.player.gold = 9999; });
      const i = await p.evaluate(() => SK.G.interactables.findIndex(o => /^Thầy Huấn Luyện/.test(o.label)));
      if (i < 0) { check('có Thầy Huấn Luyện trong phòng', false); break; }
      await p.evaluate(k2 => { const o = SK.G.interactables[k2], pl = SK.G.player; pl.x = o.x; pl.y = o.y + 2; }, i);
      await sleep(150);
      await p.keyboard.press('KeyE'); await sleep(200);
      if (k === 4) check('mới 4 bậc: chưa mở "Chủ Thuê Tuyệt Vời" (id 124)', !await D6(124));
    }
    check('đủ 5 bậc (Thầy Huấn Luyện thật): mở "Chủ Thuê Tuyệt Vời" (id 124)', await D6(124), JSON.stringify(await p.evaluate(() => SK.ach.progress(124))));
    const army = await p.evaluate(() => {
      const G = SK.G, pl = G.player, pets = (G.pet ? 1 : 0) + (pl._gardenPets || []).length, have = SK.livingMercs(G).length, out = { pets, have };
      for (let i = have + pets; i < 5; i++) SK.addMercenary(G, pl, 'npc_02', pl.x - 8, pl.y, { hired: false, armed: false });
      SK_GAME.debug.stage('1-4'); return out;
    });
    await until(p, () => SK_GAME.stage === '1-4' && SK_GAME.phase === 'play', null, 6000);
    check('5 tùy tùng + thú cưng chưa đủ 6: chưa mở id 126', !await D6(126) || army.pets + army.have >= 6, JSON.stringify(army));
    await p.evaluate(() => { const G = SK.G, pl = G.player; SK.addMercenary(G, pl, 'npc_02', pl.x - 8, pl.y, { hired: false, armed: false }); if (!SK.G.pet) { /* đủ nhờ tùy tùng */ } SK.addMercenary(G, pl, 'npc_02', pl.x - 8, pl.y, { hired: false, armed: false }); SK_GAME.debug.stage('1-5'); });
    await until(p, () => SK_GAME.stage === '1-5' && SK_GAME.phase === 'play', null, 6000);
    check('tùy tùng + thú cưng đạt 6 khi sang ải kế: mở "Người đông sức mạnh" (id 126)', await D6(126), JSON.stringify(await p.evaluate(() => ({ m: SK.livingMercs(SK.G).length, pet: !!SK.G.pet }))));
    await p.context().close();

    // ---- 6e. Thần Điện Thủ Hộ: 8 / 16 / 24 đợt (id 40, 41, 42) và tháp đạt Phẩm + sao tối đa (id 74)
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    check('vào Thần Điện Thủ Hộ', await p.evaluate(() => { SK_GAME.debug.seed(31); SK_GAME.debug.defence('knight'); return true; }) && await until(p, () => SK_GAME.state === 'stage' && SK.G.defence && SK_GAME.phase === 'play', null, 12000));
    await p.evaluate(() => SK_GAME.debug.god(true));
    async function waves(n) {   // dọn n đợt bằng đường của game: quái hết, hàng đợi rỗng, updateWaves tự đếm và phát defenceWaveClear
      for (let i = 0; i < n; i++) {
        const w0 = await p.evaluate(() => { const d = SK.G.defence; if (d.won || d.lost) return -1; for (const e of SK.G.enemies) { e.dwave = false; e.st = 'dead'; e.hp = 0; } d.queue = []; d.phase = 'fight'; d.stone.hp = d.stone.max; return d.stats.waves; });
        if (w0 < 0) return false;
        if (!await until(p, w => SK.G.defence.stats.waves > w, w0, 3000)) return false;
      }
      return true;
    }
    check('chặn 7 đợt: chưa mở 40', await waves(7) && !await D6(40) && (await prog(40)).cur === 7, JSON.stringify(await prog(40)));
    check('chặn đợt thứ 8: mở "Vệ Binh" (id 40), chưa mở 41', await waves(1) && await D6(40) && !await D6(41));
    check('chặn tới đợt 16: mở "Thủ Hộ Thần Điện" (id 41)', await waves(8) && await D6(41) && !await D6(42));
    // tháp: 3 tháp tối đa -> tiến độ 3; đủ mọi loại -> id 74
    const nt = await p.evaluate(() => SK.DEFENCE.ids.length);
    const maxTowers = k => p.evaluate(n => {
      const G = SK.G, d = G.defence, Df = SK.defence, C = SK.DEFENCE;
      d.coins = 1e7;
      for (const id of C.ids.slice(0, n)) {
        if (!d.towers.some(t => t.id === id)) { const pad = d.pads.findIndex(q => !q.tower); Df.place(G, pad, id); }
        const t = d.towers.find(q => q.id === id), pi = d.pads.findIndex(q => q.tower === t);
        while (t.pham < C.phamMax) Df.upgrade(G, pi);
      }
      Df.giveExp(G, 1e8 * n);
      return d.towers.filter(t => t.pham >= C.phamMax && t.star >= C.starExp.length).length;
    }, k);
    const m3 = await maxTowers(3);
    check('3 tháp đạt Phẩm 6 + sao tối đa (nâng bằng Df.place / Df.upgrade / Df.giveExp thật)', m3 === 3, String(m3));
    await waves(1);
    const pg74 = await prog(74);
    check('qua đợt kế: tiến độ id 74 = 3/11, chưa mở', pg74.cur === 3 && pg74.max === 11 && !await D6(74) && nt >= 11, JSON.stringify(pg74) + ' loại tháp ' + nt);
    const mAll = await maxTowers(nt);
    await waves(1);
    check('đủ ' + nt + ' loại tháp đạt Phẩm + sao tối đa: mở "Vững Như Thành Đồng" (id 74)', mAll === nt && await D6(74), mAll + ' ' + JSON.stringify(await prog(74)));
    check('chặn tới đợt 24: mở "Tường Than Thở" (id 42), ô vườn 7 mở theo', await waves(6) && await D6(42) && await p.evaluate(() => SK.garden.state().open[6] === true), JSON.stringify(await prog(42)));
    const rw42 = await p.evaluate(() => { const r = SK.ach.claim(42); return { r }; });
    check('nhận thưởng id 42: đá cộng thật, chậu cây / băng từ chưa có đích nhận thì bỏ qua đúng 2 phần', rw42.r.ok && rw42.r.gems > 0 && rw42.r.skipped === 2, JSON.stringify(rw42));
    await p.context().close();

    // ---- 6f. Mê Trận: Uy Áp 20 (id 87), 5 lần "làm tốt lắm" liên tiếp (id 89)
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    check('vào Mê Trận', await p.evaluate(() => { SK_GAME.debug.seed(31); SK_GAME.debug.matrix('knight'); return true; }) && await until(p, () => SK_GAME.state === 'stage' && SK.G.mode === 'matrix' && SK_GAME.phase === 'play', null, 12000));
    await p.evaluate(() => SK_GAME.debug.god(true));
    const judgeAt = async (f, reward) => {
      await p.evaluate(f2 => { while (SK.STAGES[SK.STAGES.length - 1].floor < f2 + 1) SK.matrixNextFloor(); SK_GAME.debug.stage(f2 + '-5'); }, f);
      await until(p, l => SK_GAME.stage === l && SK_GAME.phase === 'play', f + '-5', 6000);
      return p.evaluate(rw => !!SK.matrix.judge(SK.G, { reward: rw }), reward);
    };
    for (let f = 1; f <= 3; f++) await judgeAt(f, true);
    await judgeAt(4, false);
    check('3 lần Thưởng rồi 1 lần Phạt: chuỗi đứt, chưa mở 89', (await prog(89)).cur === 3 && !await D6(89), JSON.stringify(await prog(89)));
    for (let f = 5; f <= 8; f++) await judgeAt(f, true);
    check('4 lần liên tiếp: chưa mở 89', !await D6(89) && (await prog(89)).cur === 4, JSON.stringify(await prog(89)));
    await judgeAt(9, true);
    check('5 lần "làm tốt lắm" liên tiếp: mở "Chạy đua thời gian" (id 89)', await D6(89), JSON.stringify(await prog(89)));
    await p.evaluate(() => { while (SK.STAGES[SK.STAGES.length - 1].floor < 21) SK.matrixNextFloor(); SK_GAME.debug.stage('20-1'); });
    await until(p, () => SK_GAME.stage === '20-1' && SK_GAME.phase === 'play', null, 6000);
    check('Uy Áp 19 (tầng 20): chưa mở 87', !await D6(87) && (await prog(87)).cur === 19, JSON.stringify(await prog(87)));
    await p.evaluate(() => SK_GAME.debug.stage('21-1'));
    await until(p, () => SK_GAME.stage === '21-1' && SK_GAME.phase === 'play', null, 6000);
    check('Uy Áp 20 (tầng 21): mở "Núi áp lực" (id 87)', await until(p, () => SK.ach.done(87), null, 4000), JSON.stringify(await prog(87)));
    await p.context().close();

    // ---- 6g. Hư Không: khiên vỡ (140), Đạo Tặc (142), Thiền Vệ đôi (157), Xu tiêu 10.000 (145), vượt độ 1 (141), độ 2 (146)
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    const voidRun = async tier => {
      await p.evaluate(t => { try { SK.lobby.enter(); } catch (e) { /* sảnh */ } SK_GAME.debug.seed(31); SK.voidMode.start('knight', t); }, tier);
      return until(p, () => SK_GAME.state === 'stage' && SK.G.mode === 'void' && SK_GAME.phase === 'play', null, 12000);
    };
    const kill = id => p.evaluate(id2 => { const G = SK.G, pl = G.player, e = SK.makeEnemy(G, id2, pl.x + 24, pl.y, G.room); e.vs = null; e.st = 'idle'; e.stT = 0; G.enemies.push(e); SK.hurtEnemy(G, e, 99999, false, 0, 0); return true; }, id);
    check('vào Hư Không độ 1', await voidRun(1));
    await p.evaluate(() => SK_GAME.debug.god(true));
    check('chưa đánh gì: id 140, 142, 157 đều chưa mở', (await doneOf([140, 142, 157])).length === 0);
    await p.evaluate(() => { const G = SK.G, pl = G.player, e = SK.makeEnemy(G, 'e_void_guard', pl.x + 24, pl.y, G.room); G.enemies.push(e); SK.voidMode.breakLayer(G, e, 'wear'); });
    check('phá một tầng khiên Tinh Anh (V.breakLayer): mở "Đánh tan!" (id 140)', await D6(140));
    await kill('e_void_thief');
    check('hạ Hư Không Đạo Tặc: mở "Bắt trộm" (id 142)', await D6(142));
    await kill('e_void_staffmonk');
    check('hạ một Thiền Vệ (Trượng): chưa mở id 157', !await D6(157));
    await kill('e_void_beadsmonk');
    check('hạ cả Thiền Vệ Châu trong cùng ván: mở "Bồ Đề Minh Kính" (id 157)', await D6(157));
    const xu = await p.evaluate(() => { const G = SK.G, v = G.void; v.xu = 10000; let n = 0; while (v.xu >= 25 && n++ < 1000) SK.voidMode.exchange(G, 'xuToGold'); return { spent: v.xuSpent, xu: v.xu }; });
    check('Nhà Ngân Hàng đổi hết 10.000 Xu Ám Tinh (V.exchange thật): xuSpent = 10000', xu.spent === 10000, JSON.stringify(xu));
    check('xuSpent tính vào bộ đếm khi hết ván: chưa mở id 145 trước khi ván kết thúc', !await D6(145));
    check('vượt Hư Không độ 1 thật (3-5)', await winReal(p));
    d6 = await doneOf(NEW);
    check('thắng độ 1: mở "Lần đầu chạm mặt Hư Không" (id 141) và "Khách quen Hư Không" (id 145); chưa mở 146 (độ 2)', d6.includes(141) && d6.includes(145) && !d6.includes(146), JSON.stringify(d6));
    check('vào Hư Không độ 2', await voidRun(2));
    await p.evaluate(() => SK_GAME.debug.god(true));
    check('vượt Hư Không Hỗn Độn thật', await winReal(p));
    check('thắng độ 2: mở "Tái Thám Hiểm Hư Không" (id 146)', await D6(146));
    const rw146 = await p.evaluate(() => { const r = SK.ach.claim(146); return { ok: r.ok, err: r.err, gems: r.gems, box: SK.profile.box.length }; });
    check('thưởng id 146: đá cộng thật và vũ khí vào hòm', rw146.ok && rw146.gems > 0, JSON.stringify(rw146));
    await p.context().close();

    // ---- 6h. Sổ Tay: nhãn khoá còn ở mục chưa có cơ chế, mục mới mở hiện tiến độ
    p = await boot({ welcomed: 1, gems: 0, unlocked: ['knight'] });
    const lab = await p.evaluate(() => { SK.ach.open({}); const q = id => { document.querySelector('#sk-ach [data-id="' + id + '"]').click(); return document.getElementById('sk-ach-det').innerText; }; return { a: q(9), b: q(65) }; });
    check('Sổ Tay: id 9 hiện tiến độ 0/1, id 65 (câu cá) hiện "Chưa có ở bản web"', /Tiến độ:\s*0\/1/.test(lab.a) && !/Chưa có ở bản web\.$/m.test(lab.a.split('Thưởng')[0]) && /Chưa có ở bản web/.test(lab.b), lab.a.replace(/\n/g, ' | ') + ' // ' + lab.b.replace(/\n/g, ' | '));
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
