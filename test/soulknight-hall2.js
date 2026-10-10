/*
 * Sảnh Hiệp Sĩ Linh Hồn, bước 1-3 của games/soulknight/tools/polish/HALL.md: kho đồ + thư + tương tác sảnh, rơi vật liệu,
 * Két Sắt / Chuyển phát / Máy Đổi / Thùng Rác / Du Lịch Lợi Hại / Standee / Máy Game. Không dùng ?quick=1: vào sảnh như người chơi,
 * đứng cạnh từng món (móc debug đặt chỗ đứng), bấm phím E thật, kiểm hộp thoại và tác dụng bằng số.
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-hall2.js   (SK_URL để chạy trên Pages)
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-hall2/.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-hall2');
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
  // Vừa đóng hộp thoại thì sảnh chặn E một nhịp (không mở lại ngay): chưa mở thì bấm lại một lần.
  if (!await until(p, () => !document.getElementById('hs-modal').hidden, null, 1200)) {
    await p.keyboard.press('KeyE');
    await until(p, () => !document.getElementById('hs-modal').hidden, null, 2000);
  }
  await sleep(150);
  return dlgText(p);
}

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 0. hồ sơ trắng: thư chào, các trường mới rỗng
    let p = await boot(null);
    let f = await prof(p);
    check('hồ sơ trắng: thư chào "Huấn luyện đạt", kho/két/thống kê rỗng',
      f.mail.length === 1 && f.mail[0].title === 'Huấn luyện đạt' && !Object.keys(f.items).length && f.safe.level === 0 && f.stats.kills === 0 && f.stats.best === 0 && f.box.length === 0,
      JSON.stringify({ mail: f.mail.map(m => m.title), safe: f.safe.level }));
    const zones = await p.evaluate(() => SK.hall.zones());
    const names = zones.map(z => z.slot + '=' + z.name);
    check('có 21 món tương tác với tên Việt (gồm Máy Đổi, Máy Game, Bàn Rèn, Bàn Thiết Kế)', zones.length === 21 && zones.some(z => z.slot === 'token_machine') && zones.some(z => z.slot === 'arcade_machine'), names.join(', '));
    // Két Sắt khoá (chưa qua 2-2)
    let t = await useSlot(p, 'safe');
    check('Két Sắt khoá khi chưa qua ải 2-2, không có nút Nâng cấp', t && /Két Sắt/.test(t) && await p.evaluate(() => !!document.getElementById('sk-safe-lock') && !document.getElementById('sk-safe-up')), t && t.slice(0, 90));
    await closeDlg(p);
    // Hostess khoá khi chưa vượt ải
    t = await useSlot(p, 'hostess');
    check('Du Lịch Lợi Hại khoá khi chưa vượt Chế độ Ải', t && await p.evaluate(() => !!document.getElementById('sk-host-lock') && !SK.profile.setBadass(true)), t && t.slice(0, 80));
    await closeDlg(p);
    // Món chưa làm: tên + "Chưa có ở bản web"
    t = await useSlot(p, 'fridge');
    check('Tủ Lạnh (chưa làm): hiện tên + "Chưa có ở bản web"', t && /Tủ Lạnh/.test(t) && /Chưa có ở bản web/.test(t), t && t.replace(/\n/g, ' | '));
    await closeDlg(p);
    await p.context().close();

    // ============ 1. hồ sơ đã qua 2-2, đủ đá: các món bước 3
    p = await boot({ gems: 5000, won: { knight: 1 }, stats: { best: 7 }, welcomed: 1, unlocked: ['knight'] });

    // --- nhãn + phím
    let pos = await stand(p, 'safe');
    const near = await p.evaluate(() => SK.hall.near());
    check('đứng cạnh Két Sắt: nhãn hiện tên Việt "Két Sắt"', pos && near && near.slot === 'safe' && near.name === 'Két Sắt', JSON.stringify(near));
    await p.screenshot({ path: path.join(SHOTS, 'label-safe.png') });

    // --- Két Sắt: cấp 1 trừ đúng đá; vàng đầu ván +2
    t = await useSlot(p, 'safe');
    check('bấm E: hộp thoại Két Sắt (Vàng ban đầu, giá 500)', t && /Két Sắt/.test(t) && /Vàng ban đầu: \+0/.test(t) && /500/.test(t), t && t.replace(/\n/g, ' | ').slice(0, 140));
    await p.screenshot({ path: path.join(SHOTS, 'dlg-safe.png') });
    await p.click('#sk-safe-up');
    await sleep(150);
    f = await prof(p);
    check('nâng Két Sắt cấp 1: trừ đúng 500 đá, vàng +2', f.gems === 4500 && f.safe.level === 1 && f.safe.gold === 2, JSON.stringify({ gems: f.gems, safe: f.safe }));
    check('hộp thoại cập nhật: cấp 1/5, +2 vàng', /\+2 mỗi ván \(cấp 1\/5\)/.test(await dlgText(p)), (await dlgText(p) || '').replace(/\n/g, ' | ').slice(0, 120));
    // nhiều cấp: 500 → 1000 (cấp 2), đủ đá
    await p.click('#sk-safe-up'); await sleep(120);
    f = await prof(p);
    check('cấp 2: trừ thêm 1000 đá, vàng +4', f.gems === 3500 && f.safe.level === 2 && f.safe.gold === 4, JSON.stringify({ gems: f.gems, level: f.safe.level }));
    // thiếu đá thì chặn
    await p.evaluate(() => { SK.profile.spend(SK.profile.gems - 100); });
    await closeDlg(p);
    t = await useSlot(p, 'safe');
    check('thiếu đá: nút Nâng cấp tắt + báo thiếu', await p.evaluate(() => document.getElementById('sk-safe-up').disabled && !!document.getElementById('sk-safe-short')), (t || '').replace(/\n/g, ' | ').slice(0, 120));
    await closeDlg(p);

    // --- Chuyển phát
    const g0 = (await prof(p)).gems;
    t = await useSlot(p, 'postman');
    check('Chuyển phát: "Bạn có bưu kiện, vui lòng ký nhận"', t && /Bạn có bưu kiện, vui lòng ký nhận/.test(t), t && t.replace(/\n/g, ' | ').slice(0, 110));
    await p.click('#sk-post-sign'); await sleep(150);
    f = await prof(p);
    check('ký nhận: +500 đá và +1 vũ khí vào hòm', f.gems === g0 + 500 && f.box.length === 1, JSON.stringify({ gems: f.gems, g0, box: f.box }));
    await closeDlg(p);
    t = await useSlot(p, 'postman');
    check('lần hai trong ngày: "Mai gặp", không nhận thêm', t && /Mai gặp/.test(t) && await p.evaluate(() => !document.getElementById('sk-post-sign')) && (await prof(p)).gems === g0 + 500, (t || '').replace(/\n/g, ' | '));
    // đổi ngày: lùi ngày hồ sơ rồi nhận lại được
    await p.evaluate(() => { const k = 'sk.profile.v1', o = JSON.parse(localStorage.getItem(k)); o.day = '2000-01-01'; localStorage.setItem(k, JSON.stringify(o)); });
    await closeDlg(p);
    check('hồ sơ lưu ngày + daily (localStorage)', await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('sk.profile.v1')); return /^\d{4}-\d\d-\d\d$/.test(o.day) && o.daily.postman === 1; }));

    // --- Hộp Thư
    const mid = await p.evaluate(() => SK.profile.addMail({ title: 'Thưởng thử', body: 'Quà kiểm thử', reward: { gems: 250, items: { material_iron: 3 } } }));
    const g1 = (await prof(p)).gems;
    // Hộp thoại Chuyển phát phải đóng hẳn trước khi mở Hộp Thư, không thì đọc nhầm chữ của hộp cũ.
    await until(p, () => document.getElementById('hs-modal').hidden, null, 2000);
    t = await useSlot(p, 'mail_box');
    if (!/Thưởng thử/.test(t || '')) { await sleep(300); t = await dlgText(p); }
    check('Hộp Thư liệt kê thư kèm thưởng', t && /Thưởng thử/.test(t) && /250/.test(t) && /Mỏ Sắt ×3/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 120));
    await p.screenshot({ path: path.join(SHOTS, 'dlg-mail.png') });
    await p.click('#sk-mail button[data-act="claim"]'); await sleep(150);
    f = await prof(p);
    check('nhận thư: +250 đá, +3 Mỏ Sắt, thư biến mất', f.gems === g1 + 250 && f.items.material_iron === 3 && !f.mail.some(m => m.id === mid), JSON.stringify({ gems: f.gems - g1, iron: f.items.material_iron }));
    check('thư không thưởng: "Hộp thư trồng..." khi hết', await p.evaluate(() => { for (const m of SK.profile.mail) SK.profile.deleteMail(m.id); return SK.profile.mail.length === 0; }));
    await closeDlg(p);

    // --- Máy Đổi
    t = await useSlot(p, 'token_machine');
    check('Máy Đổi không có vé: "Cần Vé Đổi"', t && /Cần Vé Đổi/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 100));
    await closeDlg(p);
    await p.evaluate(() => { SK.profile.addItem('token_weapon_none_2', 1); SK.profile.addItem('token_seed_none_1', 1); SK.profile.addItem('token_skin_none_0', 1); });
    const box0 = (await prof(p)).box.length;
    t = await useSlot(p, 'token_machine');
    check('Máy Đổi liệt kê vé; vé skin báo "Không có vật phẩm có thể đổi"', t && /Vé Đổi Vũ Khí hạng 2/.test(t) && /Không có vật phẩm có thể đổi/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 160));
    await p.click('#sk-tokens button[data-k="token_weapon_none_2"]'); await sleep(150);
    f = await prof(p);
    check('đổi vé vũ khí hạng 2: vé -1, hòm +1 vũ khí', !f.items.token_weapon_none_2 && f.box.length === box0 + 1, JSON.stringify({ box: f.box.length, box0 }));
    await p.click('#sk-tokens button[data-k="token_seed_none_1"]'); await sleep(150);
    f = await prof(p);
    check('đổi vé hạt giống hạng 2: vé -1, +1 hạt giống', !f.items.token_seed_none_1 && Object.keys(f.items).some(k => /^plant_.*_seed$/.test(k)), JSON.stringify(f.items));
    await closeDlg(p);

    // --- Thùng Rác
    const bx = (await prof(p)).box.length;
    t = await useSlot(p, 'trash_can');
    check('Thùng Rác: "Muốn bỏ vũ khí hiện tại?" liệt kê vũ khí trong hòm', t && /Muốn bỏ vũ khí hiện tại\?/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 120));
    await p.click('#sk-trash button'); await sleep(150);
    check('bỏ vũ khí: hòm giảm 1', (await prof(p)).box.length === bx - 1, bx + ' → ' + (await prof(p)).box.length);
    await closeDlg(p);

    // --- Du Lịch Lợi Hại (SK.profile.setBadass)
    t = await useSlot(p, 'hostess');
    check('Du Lịch Lợi Hại: hỏi "Đổi sang Du Lịch Lợi Hại?"', t && /Đổi sang Du Lịch Lợi Hại\?/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 100));
    await p.click('#sk-host-yes'); await sleep(150);
    check('đổi xong: SK.profile.badass = true + "Du lịch vui vẻ!"', await p.evaluate(() => SK.profile.badass) && /Du lịch vui vẻ!/.test(await dlgText(p)));
    await closeDlg(p);
    t = await useSlot(p, 'hostess');
    check('bấm lại: hỏi trở về Du Lịch Bình Thường', /Đổi sang trạng thái Du Lịch Bình Thường\?/.test(t || ''));
    await p.click('#sk-host-yes'); await sleep(150);
    check('đổi về bình thường: badass = false', !(await p.evaluate(() => SK.profile.badass)));
    await closeDlg(p);

    // --- Standee (Gallery)
    t = await useSlot(p, 'gallery');
    check('Standee: đã mở khóa 1 nhân vật, vẽ 1 hình', t && /Standee/.test(t) && await p.evaluate(() => /Đã mở khóa 1\//.test(document.getElementById('sk-gal-count').innerText) && document.querySelectorAll('#sk-gal canvas').length === 1), (t || '').replace(/\n/g, ' | ').slice(0, 100));
    await p.screenshot({ path: path.join(SHOTS, 'dlg-gallery.png') });
    await closeDlg(p);

    // --- Máy Game
    t = await useSlot(p, 'arcade_machine');
    check('Máy Game: đọc câu bảo trì quay vòng', t && /Máy Game đang bảo trì, xin hãy chờ!/.test(t), JSON.stringify(t) + ' near=' + JSON.stringify(await p.evaluate(() => SK.hall.near())));
    await closeDlg(p);
    t = await useSlot(p, 'arcade_machine');
    check('Máy Game lần hai: câu kế tiếp', t && /Các kỹ sư đang nghiên cứu/.test(t));
    await closeDlg(p);

    // --- chạm nhãn (không phím) mở Tủ Lạnh; đóng bằng Enter không mở lại
    await stand(p, 'fridge');
    const ls = await p.evaluate(() => SK.hall.labelScreen());
    await sleep(400);   // sảnh chặn chạm một nhịp sau khi đóng hộp thoại trước
    await p.mouse.click(ls.x, ls.y);
    await until(p, () => !document.getElementById('hs-modal').hidden, null, 1500);
    await sleep(200);
    check('chạm nhãn món = bấm E', /Tủ Lạnh/.test(await dlgText(p) || ''));
    await p.keyboard.press('Enter');   // nút Đóng đang giữ tiêu điểm
    await sleep(700);
    check('Enter đóng hộp thoại và không mở lại ngay', await p.evaluate(() => document.getElementById('hs-modal').hidden && !document.getElementById('sk-lobby').classList.contains('only-modes')), JSON.stringify(await p.evaluate(() => ({ h: document.getElementById('hs-modal').hidden, om: document.getElementById('sk-lobby').classList.contains('only-modes'), ae: document.activeElement.id || document.activeElement.tagName }))));

    // --- đi bằng phím thật tới món: từ giữa sảnh đi lên gần Hộp Thư
    await p.evaluate(() => { const m = SK.hallState.me; m.x = -3; m.y = 1.5; });
    await sleep(200);
    const startX = await p.evaluate(() => SK.hall.state.me.x);
    await p.keyboard.down('KeyD'); await sleep(2300); await p.keyboard.up('KeyD');
    const mv = await p.evaluate(() => ({ me: SK.hall.state.me, near: SK.hall.near() }));
    check('đi bằng phím D thì lại gần một món và hiện nhãn (không chỉ đứng yên)', mv.me.x > startX + 4, JSON.stringify({ x: mv.me.x.toFixed(1), near: mv.near }));
    await p.screenshot({ path: path.join(SHOTS, 'label-walk.png') });

    // ============ ảnh nhãn mọi món (kiểm chữ không đè) ở ba vị trí
    await p.evaluate(() => SK.hall.labelsAll(true));
    for (const [nm, x, y] of [['left', -14, 0], ['mid', -2, 2], ['right', 9, 1]]) {
      await p.evaluate(([x, y]) => { const m = SK.hallState.me; m.x = x; m.y = y; }, [x, y]);
      await sleep(350);
      await p.screenshot({ path: path.join(SHOTS, 'labels-all-' + nm + '.png') });
    }
    await p.evaluate(() => SK.hall.labelsAll(false));

    // ============ vào ván: vàng Két Sắt, rơi vật liệu, nhặt vũ khí, cuối ván vàng → đá
    const invBefore = await p.evaluate(() => SK.profile.item('material_wood'));
    await p.evaluate(() => SK_GAME.debug.seed(7));
    await p.evaluate(() => SK.lobby.launch('knight'));
    await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);
    const gold0 = await p.evaluate(() => SK_GAME.player.gold);
    check('vào ván: vàng khởi đầu = +4 theo Két Sắt cấp 2', gold0 === 4, 'gold ' + gold0);

    // thống kê rơi: p>100 → trung bình 1,5 mỗi lần (boss_stone_man, Mỏ Sắt 150) và tỉ lệ 2,5% (e_succulent, hạt Kèn)
    const dist = await p.evaluate(() => {
      let iron = 0, seed = 0, N = 20000;
      for (let i = 0; i < N; i++) {
        for (const r of SK.drops.roll('boss_stone_man')) if (r.key === 'material_iron') iron += r.n;
        for (const r of SK.drops.roll('e_succulent')) if (r.key === 'plant_trumpet_seed') seed += r.n;
      }
      const g = Array.from({ length: N }, () => SK.drops.roll('boss_stone_man').filter(r => /^material_magic_/.test(r.key)).length);
      return { iron: iron / N, seed: seed / N, ironRows: SK.drops.table.boss_stone_man.filter(r => r[0] === 'material_iron').map(r => r[1]), maxMagic: Math.max(...g), tab: Object.keys(SK.drops.table).length };
    });
    check('[ĐO] p=150 → trung bình 1,5 món/lần (1 chắc + 50% món 2)', Math.abs(dist.iron - 1.5) < 0.03 && dist.ironRows[0] === 150, JSON.stringify(dist));
    check('[ĐO] p=2,5% → ≈ 0,025 hạt/lần; bảng rơi có ' + dist.tab + ' loại quái', Math.abs(dist.seed - 0.025) < 0.006 && dist.tab > 250, dist.seed.toFixed(4));
    check('nhóm DropGroups: mỗi nhóm tối đa 1 mảnh phép thuật (≤ số nhóm)', dist.maxMagic <= 2, 'tối đa ' + dist.maxMagic);

    // giết quái thật có Drops → sinh vật nhặt → nhặt → kho tăng
    const killed = await p.evaluate(() => {
      const G = SK.G, pl = G.player, e = SK.makeEnemy(G, 'ex_orc02', pl.x + 30, pl.y, G.room);
      e.st = 'idle'; e.stT = 0; G.enemies.push(e);
      const r0 = SK.rand; SK.rand = () => 0;
      const before = G.pickups.length;
      SK.hurtEnemy(G, e, 99999, false, 0, 0);
      SK.rand = r0;
      return { dead: e.st === 'dead', mats: G.pickups.filter(k => k.kind === 'material').map(k => k.key), before };
    });
    check('giết ex_orc02: ra vật nhặt "material" (Gỗ + băng Xông Vào Rừng Sâu)', killed.dead && killed.mats.indexOf('material_wood') >= 0, JSON.stringify(killed));
    await sleep(150);
    await p.screenshot({ path: path.join(SHOTS, 'drop-material.png') });
    const picked = await p.evaluate(() => {
      const G = SK.G, pl = G.player, w0 = SK.profile.item('material_wood');
      for (const k of G.pickups) if (k.kind === 'material') { k.t = 1; k.x = pl.x; k.y = pl.y - 6; k.z = 0; }
      SK.updatePickups(G, 0.016);
      const e = SK.makeEnemy(G, 'ex_orc02', pl.x + 30, pl.y, G.room); e.st = 'idle'; e.stT = 0; G.enemies.push(e);
      const r0 = SK.rand; SK.rand = () => 0; SK.hurtEnemy(G, e, 99999, false, 0, 0); SK.rand = r0;
      const w1 = SK.profile.item('material_wood');
      for (const k of G.pickups) if (k.kind === 'material') { k.t = 1; k.x = pl.x; k.y = pl.y - 6; k.z = 0; }
      SK.updatePickups(G, 0.016);
      return { d: SK.profile.item('material_wood') - w1, w0, w1, left: G.pickups.filter(k => k.kind === 'material').length, nums: G.nums.map(n => n.val).filter(v => /Gỗ/.test(v)) };
    });
    check('nhặt vật nhặt: SK.profile.item("material_wood") tăng 1, hiện "+1 Gỗ"', picked.d === 1 && picked.left === 0 && picked.nums.length >= 1, JSON.stringify(picked));
    const bossK = await p.evaluate(() => {
      const G = SK.G, pl = G.player, b4 = SK.profile.stats.boss, r0 = SK.rand;
      SK.rand = () => 0;
      SK.emit('enemyKill', G, { id: 'boss07', bossKey: 'boss07', x: pl.x + 20, y: pl.y });
      SK.rand = r0;
      return { n: G.pickups.filter(k => k.kind === 'material').length, keys: G.pickups.filter(k => k.kind === 'material').map(k => k.key).slice(0, 6), boss: SK.profile.stats.boss - b4 };
    });
    check('trùm (boss07) chết: ra hạt giống/vật liệu từ bảng rơi trùm, thống kê trùm +1', bossK.n >= 5 && bossK.boss === 1, JSON.stringify(bossK));
    await p.evaluate(() => { const G = SK.G, pl = G.player; for (const k of G.pickups) if (k.kind === 'material') { k.t = 1; k.x = pl.x; k.y = pl.y - 6; k.z = 0; } SK.updatePickups(G, 0.016); });

    // nhặt vũ khí → picked
    const { wid, pk0 } = await p.evaluate(() => { const id = SK.DS.weaponGrades[2][0]; SK.G.items.push({ id, x: SK.G.player.x, y: SK.G.player.y + 4, t: 0 }); return { wid: id, pk0: SK.profile.picked(id) }; });
    await sleep(200);
    let pk1 = pk0;   // máy chậm có thể nuốt lần nhấn E giữa hai khung hình: bấm lại tới khi game nhận (tối đa 5)
    for (let i = 0; i < 5 && pk1 === pk0; i++) { await p.keyboard.press('KeyE'); await sleep(300); pk1 = await p.evaluate(id => SK.profile.picked(id), wid); }
    check('nhặt vũ khí: SK.profile.picked(id) tăng đúng 1', pk1 === pk0 + 1, wid + ' ' + pk0 + ' → ' + pk1);

    // cuối ván: vàng còn → đá; thống kê; vật liệu không mất khi chết
    const pre = await p.evaluate(() => { const pl = SK.G.player; pl.gold = 37; pl.god = false; return { gems: SK.profile.gems, kills: SK_GAME.kills, wood: SK.profile.item('material_wood'), st: SK.profile.stats }; });
    await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; pl.armor = 0; SK.hurtPlayer(SK.G, 999); });
    const dead = await until(p, () => SK_GAME.state === 'dead', null, 8000);
    await sleep(300);
    const post = await p.evaluate(() => ({ gems: SK.profile.gems, wood: SK.profile.item('material_wood'), st: SK.profile.stats, item: JSON.parse(localStorage.getItem('sk.profile.v1')).inv.material_wood }));
    check('thua ván: vàng còn 37 → +37 đá (cộng quái hạ ' + pre.kills + ')', dead && post.gems - pre.gems === 37 + pre.kills, JSON.stringify({ d: post.gems - pre.gems, kills: pre.kills }));
    check('thống kê hồ sơ: dead +1, kills cộng dồn', post.st.dead === pre.st.dead + 1 && post.st.kills === pre.st.kills + pre.kills, JSON.stringify(post.st));
    check('vật liệu nhặt không mất khi chết (kho + localStorage)', post.wood === pre.wood && post.item === pre.wood, JSON.stringify({ wood: post.wood, ls: post.item }));
    await p.context().close();
  } catch (e) {
    check('chạy trọn', false, (e.stack || e.message).split('\n').slice(0, 3).join(' / '));
  }
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(out.join('\n'));
  console.log(`\n  ảnh: ${SHOTS}\n  ĐẠT ${pass}   HỎNG ${fail}`);
  process.exit(fail ? 1 : 0);
})();
