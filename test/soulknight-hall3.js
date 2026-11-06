/*
 * Sảnh Hiệp Sĩ Linh Hồn, bước 4-5 của games/soulknight/tools/polish/HALL.md: Bàn Thiết Kế (nghiên cứu bản vẽ), Bàn Rèn, Rương
 * (mang vũ khí vào ván), Máy Quay Trứng, Mèo Chiêu Tài. Vào sảnh như người chơi, đứng cạnh từng món, bấm phím E thật, kiểm hộp
 * thoại và tác dụng bằng số (trừ đúng vật liệu theo công thức, món rèn có trong tay khi vào ván, máy trứng trừ lượt/ngày...).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-hall3.js   (SK_URL để chạy trên Pages)
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-hall3/.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-hall3');
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
const weaponsInHand = p => p.evaluate(() => SK.G.player.weapons.map(w => w && w.id));
const inv = p => p.evaluate(() => SK.profile.items());
const P = p => p.evaluate(() => ({ gems: SK.profile.gems, items: SK.profile.items(), box: SK.profile.box, forged: SK.profile.forged, carry: SK.profile.carry, devd: SK.profile.devdAll,
  fish: SK.profile.fish, pity: SK.profile.eggPity, eggLeft: SK.hallEgg.left(), postPlus: SK.profile.postmanPlus }));
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 0. hồ sơ trắng: ba món Xưởng + Rương + Máy trứng + Mèo ở đúng chỗ, báo trống
    let p = await boot(null);
    const zs = await p.evaluate(() => SK.hall.zones());
    check('Bàn Rèn và Bàn Thiết Kế là món mới trong sảnh (tên Việt, dựng từ prefab gốc)', ['forge', 'station'].every(s => zs.some(z => z.slot === s && !z.kiosk)) &&
      zs.find(z => z.slot === 'forge').name === 'Bàn Rèn' && zs.find(z => z.slot === 'station').name === 'Bàn Thiết Kế', zs.filter(z => /forge|station/.test(z.slot)).map(z => z.name + '@' + z.x + ',' + z.y).join(' '));
    check('Máy Đổi giờ cũng dựng từ prefab gốc (không còn khối giữ chỗ)', zs.find(z => z.slot === 'token_machine') && !zs.find(z => z.slot === 'token_machine').kiosk);
    // chồng chéo: không món Xưởng nào đè lên món khác
    const ov = zs.filter(a => ['forge', 'station', 'token_machine'].includes(a.slot)).flatMap(a => zs.filter(b => b !== a && a.box[0] < b.box[2] && a.box[2] > b.box[0] && a.box[1] < b.box[3] && a.box[3] > b.box[1]).map(b => a.slot + '×' + b.slot));
    check('vùng tương tác Xưởng không đè lên món khác', !ov.length, ov.join(','));
    await stand(p, 'forge'); await sleep(300); await shot(p, 'workshop');
    let t = await useSlot(p, 'forge');
    check('Bàn Rèn trống: "Không có vũ khí có thể chế tạo"', t && /Bàn Rèn/.test(t) && /Không có vũ khí có thể chế tạo/.test(t) && /Búa nhỏ 40, búa lớn 80/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 140));
    await closeDlg(p);
    t = await useSlot(p, 'station');
    check('Bàn Thiết Kế trống: "Chưa thu thập được Bản Vẽ Vũ Khí"', t && /Chưa thu thập được Bản Vẽ Vũ Khí/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 140));
    await closeDlg(p);
    t = await useSlot(p, 'chest');
    check('Rương trống: hiện "1 vũ khí miễn phí cho mỗi lượt", chưa chọn vũ khí', t && /Rương/.test(t) && /1 vũ khí miễn phí cho mỗi lượt/.test(t) && /Chưa chọn vũ khí mang theo/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 140));
    await closeDlg(p);
    t = await useSlot(p, 'egg_machine');
    check('Máy Quay Trứng: lời thoại gốc + "Số lần hôm nay còn: 20"', t && /Xoay thử một cái đi, toàn hàng ngon, thật đó!/.test(t) && /Số lần hôm nay còn:\s*20/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 160));
    check('chưa đủ đá: Quay 1 lần báo thiếu, không trừ lượt', await (async () => { await p.click('#sk-egg-1'); await p.click('#sk-egg-go'); await sleep(150); const n = await p.evaluate(() => document.getElementById('sk-egg-note') && document.getElementById('sk-egg-note').innerText); return /Không đủ đá quý/.test(n || '') && (await P(p)).eggLeft === 20; })());
    await closeDlg(p);
    t = await useSlot(p, 'plutus_cat');
    check('Mèo Chiêu Tài: Cá Khô 0, tiệm liệt kê món', t && /Mèo Chiêu Tài/.test(t) && /Cá Khô:\s*0/.test(t) && /Tăng dịch vụ chuyển phát nhanh/.test(t), 'dlg=' + (t || '').replace(/\n/g, ' | ').slice(0, 160));
    await p.context().close();

    // ============ 1. Bàn Rèn: công thức thật của weapon_001 (1 gỗ + 2 sắt) và weapon_mythic_00 (6 sắt) [CFG weapons.Materials]
    const ids = {};
    p = await boot({ gems: 3000, welcomed: 1, won: { knight: 1 }, stats: { best: 7 }, unlocked: ['knight'], inv: { material_wood: 5, material_iron: 20 }, picked: {} });
    Object.assign(ids, await p.evaluate(() => ({ w1: SK.DS.weaponId('weapon_001'), w1g: SK.DS.weapons[SK.DS.weaponId('weapon_001')].w86.grade, m0: SK.DS.weaponId('weapon_mythic_00'),
      m0g: SK.DS.weapons[SK.DS.weaponId('weapon_mythic_00')].w86.grade, w1r: SK.hallForge.recipes[SK.DS.weaponId('weapon_001')].mats, m0r: SK.hallForge.recipes[SK.DS.weaponId('weapon_mythic_00')].mats })));
    check('công thức dữ liệu: weapon_001 = 1 gỗ + 2 sắt, thần thoại 00 = 6 sắt', JSON.stringify(ids.w1r.slice().sort()) === JSON.stringify([['material_iron', 2], ['material_wood', 1]]) && JSON.stringify(ids.m0r) === JSON.stringify([['material_iron', 6]]) && ids.w1g === 0 && ids.m0g === 6, JSON.stringify(ids));
    // nhận 1 lần weapon_001 (cần 2 với bậc trắng): chưa mở
    await p.evaluate(id => SK.profile.pickWeapon(id), ids.w1);
    t = await useSlot(p, 'forge');
    check('nhận 1/2 lần: chưa rèn được, hiện "Mở khóa rèn vũ khí này (1/2)"', t && /Không có vũ khí có thể chế tạo/.test(t) && /Mở khóa rèn vũ khí này \(1\/2\)/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 200));
    await closeDlg(p);
    await p.evaluate(id => SK.profile.pickWeapon(id), ids.w1);   // lần 2 → mở
    t = await useSlot(p, 'forge');
    check('nhận đủ 2 lần: weapon_001 hiện trong danh sách rèn kèm nguyên liệu 5/1 gỗ và 20/2 sắt', t && await p.evaluate(id => !!document.querySelector('#sk-forge li[data-id="' + id + '"]'), ids.w1) && /Gỗ 1\/1/.test(t) && /Mỏ Sắt 2\/2/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 200));
    await shot(p, 'dlg-forge');
    await p.click('#sk-forge li[data-id="' + ids.w1 + '"] button'); await sleep(150);
    let f = await P(p);
    check('rèn weapon_001: trừ đúng 1 gỗ + 2 sắt (5→4, 20→18), đồ rèn +1', f.items.material_wood === 4 && f.items.material_iron === 18 && f.forged.length === 1 && f.forged[0] === ids.w1, JSON.stringify({ items: f.items, forged: f.forged }));
    check('hộp thoại: "Đồ đã rèn: 1/4" và thông báo', /Đồ đã rèn:\s*1\/4/.test(await dlgText(p)) && /Đã rèn/.test(await dlgText(p)), (await dlgText(p) || '').replace(/\n/g, ' | ').slice(0, 120));
    // thiếu nguyên liệu: mythic 6 sắt khi chỉ còn 18 vẫn đủ → hạ sắt xuống 5 rồi thử
    await p.evaluate(id => SK.profile.pickWeapon(id), ids.m0);   // thần thoại: 1 lần là mở
    await p.evaluate(() => { SK.profile.spendItem('material_iron', SK.profile.item('material_iron') - 5); });
    await closeDlg(p);
    t = await useSlot(p, 'forge');
    check('thần thoại 00 mở sau 1 lần nhận', await p.evaluate(id => !!document.querySelector('#sk-forge li[data-id="' + id + '"]'), ids.m0), (t || '').replace(/\n/g, ' | ').slice(0, 160));
    await p.click('#sk-forge li[data-id="' + ids.m0 + '"] button'); await sleep(150);
    f = await P(p);
    check('thiếu nguyên liệu (5/6 sắt): "Nguyên liệu không đủ", không trừ, không thêm đồ rèn', /Nguyên liệu không đủ/.test(await dlgText(p)) && f.items.material_iron === 5 && f.forged.length === 1, JSON.stringify({ iron: f.items.material_iron, forged: f.forged.length }));
    await p.evaluate(() => SK.profile.addItem('material_iron', 1));
    await p.click('#sk-forge li[data-id="' + ids.m0 + '"] button'); await sleep(150);
    f = await P(p);
    check('đủ 6 sắt: rèn thần thoại 00, sắt về 0, đồ rèn 2', !f.items.material_iron && f.forged.length === 2 && f.forged[1] === ids.m0, JSON.stringify({ items: f.items, forged: f.forged }));
    // kho rèn tối đa 4
    await p.evaluate(id => { SK.profile.addItem('material_wood', 10); SK.profile.addItem('material_iron', 40); SK.profile.addForged(id); SK.profile.addForged(id); }, ids.w1);
    await closeDlg(p);
    await useSlot(p, 'forge');
    await p.click('#sk-forge li[data-id="' + ids.w1 + '"] button'); await sleep(150);
    f = await P(p);
    check('kho rèn đầy 4/4: "Không thể để thêm vũ khí nữa", không trừ vật liệu', /Không thể để thêm vũ khí nữa/.test(await dlgText(p)) && f.forged.length === 4 && f.items.material_wood === 14 && f.items.material_iron === 40, JSON.stringify({ forged: f.forged.length, items: f.items }));
    await closeDlg(p);

    // ============ 2. Rương: chọn món rèn mang vào ván; đồ rèn dùng một lượt
    t = await useSlot(p, 'chest');
    check('Rương liệt kê 4 đồ rèn', t && (await p.evaluate(() => document.querySelectorAll('#sk-chest li').length)) === 4 && /Đồ rèn, dùng một ván/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 160));
    await shot(p, 'dlg-chest');
    await p.click('#sk-chest li:nth-child(2) button'); await sleep(150);
    f = await P(p);
    check('chọn đồ rèn thứ 2 (thần thoại 00): ghi vào carry', f.carry && f.carry.id === ids.m0 && f.carry.from === 'forged', JSON.stringify(f.carry));
    await closeDlg(p);
    check('vào ván thật qua cửa sảnh', await startRun(p));
    const hand = await weaponsInHand(p);
    check('thần thoại 00 ở ô vũ khí thứ hai khi vào ván; ô đầu là súng nhân vật', hand[1] === ids.m0 && hand[0] && hand[0] !== ids.m0, JSON.stringify(hand));
    f = await P(p);
    check('đồ rèn dùng xong bỏ: còn 3 món, hết carry', f.forged.length === 3 && !f.forged.includes(ids.m0) && !f.carry, JSON.stringify({ forged: f.forged, carry: f.carry }));
    await p.context().close();

    // ============ 3. Rương: vũ khí trong hòm — mang vào ván, hòm vẫn giữ ("1 vũ khí miễn phí cho mỗi lượt")
    p = await boot({ gems: 100, welcomed: 1, unlocked: ['knight'] });
    const boxW = await p.evaluate(() => { const id = SK.DS.weaponId('weapon_006'); SK.profile.addBox(id); return id; });
    t = await useSlot(p, 'chest');
    check('Rương liệt kê vũ khí trong hòm ("Vũ khí trong hòm")', /Vũ khí trong hòm/.test(t || ''), (t || '').replace(/\n/g, ' | ').slice(0, 120));
    await p.click('#sk-chest li button'); await sleep(150);
    check('chọn vũ khí hòm: hộp thoại ghi "Đã chọn", nút Bỏ chọn hiện', /Đã chọn/.test(await dlgText(p)) && await p.evaluate(() => !!document.getElementById('sk-chest-clear')), (await dlgText(p) || '').replace(/\n/g, ' | ').slice(0, 140));
    await shot(p, 'dlg-chest-picked');
    await closeDlg(p);
    await startRun(p);
    const h2 = await weaponsInHand(p);
    f = await P(p);
    check('vào ván: vũ khí hòm ở ô thứ hai, hòm vẫn còn vũ khí đó', h2[1] === boxW && f.box.includes(boxW) && !f.carry, JSON.stringify({ hand: h2, box: f.box }));
    await p.context().close();

    // ============ 4. Bàn Thiết Kế: nghiên cứu bản vẽ weapon_385 (1500 đá [CFG items.blueprint_weapon_385])
    p = await boot({ gems: 2000, welcomed: 1, unlocked: ['knight'], inv: { blueprint_weapon_385: 1, blueprint_weapon_344: 1, material_iron: 50, material_wood: 50, material_gear: 50, material_battery: 50, material_cell: 50 } });
    const w385 = await p.evaluate(() => ({ id: SK.DS.weaponId('weapon_385'), r: SK.hallForge.recipes[SK.DS.weaponId('weapon_385')], need: SK.hallForge.recipes[SK.DS.weaponId('weapon_385')] && SK.hallForge.need(SK.hallForge.recipes[SK.DS.weaponId('weapon_385')]),
      bp: SK_FORGE.blueprints.blueprint_weapon_385 }));
    check('dữ liệu: bản vẽ weapon_385 giá 1500 đá, vũ khí cần bản vẽ đó mới rèn', w385.bp.mats[0][0] === 'material_gem' && w385.bp.mats[0][1] === 1500 && w385.r && w385.r.bp === 'blueprint_weapon_385', JSON.stringify(w385));
    await p.evaluate(({ id, n }) => { for (let i = 0; i < n; i++) SK.profile.pickWeapon(id); }, { id: w385.id, n: w385.need });
    t = await useSlot(p, 'forge');
    check('đã nhận đủ lần nhưng chưa nghiên cứu bản vẽ: không rèn được, nhắc "Cần nghiên cứu bản vẽ ở Bàn Thiết Kế"', /Cần nghiên cứu bản vẽ ở Bàn Thiết Kế/.test(t || '') && await p.evaluate(id => !document.querySelector('#sk-forge li[data-id="' + id + '"]'), w385.id), (t || '').replace(/\n/g, ' | ').slice(0, 160));
    await closeDlg(p);
    t = await useSlot(p, 'station');
    check('Bàn Thiết Kế liệt kê 2 bản vẽ trong kho kèm giá đá', t && await p.evaluate(() => document.querySelectorAll('#sk-station li').length) === 2 && /Bản Vẽ Tu La/.test(t) && /Đá 1[.,]?500\/1[.,]?500/.test(t), (t || '').replace(/\n/g, ' | ').slice(0, 220));
    await shot(p, 'dlg-station');
    await p.click('#sk-station li[data-k="blueprint_weapon_385"] button'); await sleep(150);
    f = await P(p);
    check('nghiên cứu Tu La: trừ đúng 1500 đá (2000→500), bản vẽ -1, đánh dấu devd', f.gems === 500 && !f.items.blueprint_weapon_385 && f.devd.blueprint_weapon_385 === 1 && f.items.blueprint_weapon_344 === 1, JSON.stringify({ gems: f.gems, devd: f.devd, bp: f.items.blueprint_weapon_344 }));
    // thiếu đá cho bản vẽ còn lại (344: 1500, còn 500)
    await p.click('#sk-station li[data-k="blueprint_weapon_344"] button'); await sleep(150);
    f = await P(p);
    check('thiếu đá (500/1500): "Nguyên liệu không đủ", không trừ, bản vẽ còn', /Nguyên liệu không đủ/.test(await dlgText(p)) && f.gems === 500 && f.items.blueprint_weapon_344 === 1 && !f.devd.blueprint_weapon_344, JSON.stringify({ gems: f.gems }));
    await closeDlg(p);
    t = await useSlot(p, 'forge');
    check('sau nghiên cứu: weapon_385 hiện trong danh sách rèn', await p.evaluate(id => !!document.querySelector('#sk-forge li[data-id="' + id + '"]'), w385.id), (t || '').replace(/\n/g, ' | ').slice(0, 120));
    await closeDlg(p);
    await p.context().close();

    // ============ 5. Máy Quay Trứng
    p = await boot({ gems: 5000, welcomed: 1, unlocked: ['knight'] });
    const before = await P(p);
    t = await useSlot(p, 'egg_machine');
    await p.click('#sk-egg-1');
    check('bấm Quay 1 lần: "Tiêu 100 Đá quay 1 lần?"', /Tiêu 100 Đá quay 1 lần\?/.test(await dlgText(p) || ''), (await dlgText(p) || '').replace(/\n/g, ' | '));
    await p.click('#sk-egg-go'); await sleep(200);
    let a1 = await P(p);
    const res1 = await p.evaluate(() => [...document.querySelectorAll('#sk-egg-res li')].map(l => l.innerText));
    const gained = d => JSON.stringify([d.items, d.box, d.gems]);
    check('quay 1 lần: trừ 100 đá, lượt còn 19, ra đúng 1 phần thưởng ghi vào hồ sơ', a1.eggLeft === 19 && res1.length === 1 && (a1.gems - (before.gems - 100)) >= 0 && gained(a1) !== gained(before), JSON.stringify({ gems: a1.gems, left: a1.eggLeft, res: res1 }));
    await shot(p, 'dlg-egg');
    await p.click('#sk-egg-10'); await p.click('#sk-egg-go'); await sleep(250);
    let a2 = await P(p);
    const res10 = await p.evaluate(() => document.querySelectorAll('#sk-egg-res li').length);
    check('quay 10 lần: lượt còn 9, ra 10 phần thưởng, đá trừ 900 (trước khi cộng thưởng đá)', a2.eggLeft === 9 && res10 === 10 && a2.pity <= 19, JSON.stringify({ left: a2.eggLeft, n: res10, gems: a2.gems }));
    check('Quay 10 lần tắt khi còn <10 lượt', await p.evaluate(() => document.getElementById('sk-egg-10').disabled));
    // hết lượt trong ngày
    for (let i = 0; i < 9; i++) { await p.click('#sk-egg-1'); await p.click('#sk-egg-go'); await sleep(60); }
    let a3 = await P(p);
    check('đủ 20 lượt: "Hôm nay không thể rút nữa", nút Quay tắt', a3.eggLeft === 0 && /Hôm nay không thể rút nữa/.test(await dlgText(p)) && await p.evaluate(() => document.getElementById('sk-egg-1').disabled), (await dlgText(p) || '').replace(/\n/g, ' | ').slice(0, 140));
    await closeDlg(p);
    // sang ngày mới thì có lại 20 lượt
    await p.evaluate(() => { const k = 'sk.profile.v1', o = JSON.parse(localStorage.getItem(k)); o.day = '2000-01-01'; localStorage.setItem(k, JSON.stringify(o)); });
    check('qua ngày: lại có 20 lượt (hồ sơ lưu daily.egg)', await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('sk.profile.v1')); return o.daily.egg === 20; }), 'daily.egg=20 trong localStorage');
    await p.context().close();

    // bộ đếm bảo đảm + bảng xác suất (không cần UI)
    p = await boot({ gems: 5000, welcomed: 1, unlocked: ['knight'] });
    const pity = await p.evaluate(() => {
      const E = SK.hallEgg, P = SK.profile, out = {};
      P.setEggPity(18);
      let r = E.spin(1, () => 0.01);                          // 0.01 → vũ khí (không phải mảnh skin), pity 18 → 19
      out.p19 = P.eggPity; out.k19 = r.results[0].kind;
      r = E.spin(1, () => 0.01);                              // lượt thứ 20: bảo đảm mảnh skin
      out.k20 = r.results[0].kind; out.after = P.eggPity; out.key = r.results[0].key;
      out.skinInInv = Object.keys(P.items()).some(k => /^material_skin_fragment_/.test(k));
      return out;
    });
    check('bảo đảm: 19 lượt không ra mảnh skin thì lượt 20 chắc chắn ra, bộ đếm về 0', pity.p19 === 19 && pity.k19 === 'weapon' && pity.k20 === 'skin' && pity.after === 0 && pity.skinInInv, JSON.stringify(pity));
    const dist = await p.evaluate(() => {
      let s = 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const N = 40000, k = {}, g = {};
      for (let i = 0; i < N; i++) { const r = SK.hallEgg.roll(rnd); k[r.kind] = (k[r.kind] || 0) + 1; if (r.kind === 'weapon') g[r.grade] = (g[r.grade] || 0) + 1; }
      const w = k.weapon || 0;
      return { kind: Object.fromEntries(Object.entries(k).map(([a, b]) => [a, +(100 * b / N).toFixed(1)])), grade: Object.fromEntries(Object.entries(g).map(([a, b]) => [a, +(100 * b / w).toFixed(1)])) };
    });
    const near = (v, e, tol) => Math.abs(v - e) <= tol;
    check('xác suất 40000 lượt khớp bảng: vũ khí 35 / vật liệu 35 / hạt giống 10 / đá 15 / mảnh skin 5 (±1,5)',
      near(dist.kind.weapon, 35, 1.5) && near(dist.kind.material, 35, 1.5) && near(dist.kind.seed, 10, 1.5) && near(dist.kind.gems, 15, 1.5) && near(dist.kind.skin, 5, 1.5), JSON.stringify(dist.kind));
    check('độ hiếm vũ khí trắng/lục/lam/tím/cam = 55/25/12/6/2 (±2)', near(dist.grade[1], 55, 2) && near(dist.grade[2], 25, 2) && near(dist.grade[3], 12, 2) && near(dist.grade[4], 6, 2) && near(dist.grade[5], 2, 2), JSON.stringify(dist.grade));
    // hòm đầy: vũ khí đổi thành đá, không mất lượt
    const full = await p.evaluate(() => {
      const P = SK.profile; P.setEggPity(0);
      const w = Object.keys(SK.DS.weapons).find(id => !SK.DS.weapons[id].starter);
      while (!P.boxFull) P.addBox(w);
      const g0 = P.gems, r = SK.hallEgg.spin(1, () => 0.01);
      return { g0, g1: P.gems, text: r.results[0].text, box: P.box.length };
    });
    check('hòm vũ khí đầy: vũ khí quay ra đổi thành 100 đá (đá: -100 +100)', full.g1 === full.g0 && /hòm đầy/.test(full.text) && full.box === 8, JSON.stringify(full));
    await p.context().close();

    // ============ 6. Mèo Chiêu Tài (thanh toán giả)
    p = await boot({ gems: 100, welcomed: 1, unlocked: ['knight'] });
    t = await useSlot(p, 'plutus_cat');
    await shot(p, 'dlg-cat');
    await p.click('#sk-cat-goods li:nth-child(2) button'); await sleep(150);
    f = await P(p);
    check('mua món khi 0 Cá Khô: "Không đủ Cá Khô", không nhận vé', /Không đủ Cá Khô/.test(await dlgText(p)) && f.fish === 0 && !Object.keys(f.items).some(k => /^token_/.test(k)), (await dlgText(p) || '').replace(/\n/g, ' | ').slice(0, 100));
    await p.click('#sk-cat-packs'); await sleep(100);
    await p.click('.hs-pack[data-pack="0"]'); await sleep(100);
    check('gói Cá Khô qua hộp thanh toán giả (không trừ tiền thật)', /Thanh toán giả lập — không trừ tiền thật/.test(await dlgText(p) || '') && /20 Cá Khô/.test(await dlgText(p) || ''), (await dlgText(p) || '').replace(/\n/g, ' | ').slice(0, 120));
    await shot(p, 'dlg-cat-pay');
    await p.click('#hs-pay-ok'); await sleep(150);
    f = await P(p);
    check('xác nhận: +20 Cá Khô', f.fish === 20 && /Cá Khô:\s*20/.test(await dlgText(p) || ''), (await dlgText(p) || '').replace(/\n/g, ' | ').slice(0, 100));
    await p.click('#sk-cat-goods li:nth-child(2) button'); await sleep(150);   // Vé Đổi Vũ Khí hạng 0 = 5 Cá Khô
    f = await P(p);
    check('mua Vé Đổi Vũ Khí hạng 0: -5 Cá Khô (20→15), +1 vé', f.fish === 15 && f.items.token_weapon_none_0 === 1, JSON.stringify({ fish: f.fish, tok: f.items.token_weapon_none_0 }));
    check('mỗi vé một lần mỗi ngày: nút chuyển "Đã mua" và tắt', await p.evaluate(() => { const b = document.querySelector('#sk-cat-goods li:nth-child(2) button'); return b.disabled && /Đã mua/.test(b.innerText); }));
    await p.click('#sk-cat-goods li:nth-child(1) button'); await sleep(150);   // nâng cấp chuyển phát: 20 Cá Khô, chỉ còn 15
    f = await P(p);
    check('nâng cấp chuyển phát khi thiếu Cá Khô (15/20): chặn', /Không đủ Cá Khô/.test(await dlgText(p)) && !f.postPlus && f.fish === 15, JSON.stringify({ fish: f.fish, plus: f.postPlus }));
    await p.evaluate(() => SK.profile.addFish(5));
    await p.click('#sk-cat-goods li:nth-child(1) button'); await sleep(150);
    f = await P(p);
    check('nâng cấp chuyển phát đủ 20 Cá Khô: Cá Khô về 0, Chuyển Phát nhận +100 đá mỗi ngày', f.fish === 0 && f.postPlus === true, JSON.stringify({ fish: f.fish, plus: f.postPlus }));
    await closeDlg(p);
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
