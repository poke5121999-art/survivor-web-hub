/*
 * Sảnh Hiệp Sĩ Linh Hồn, bước 7 + 9 của games/soulknight/tools/polish/HALL.md: nội thất mở bằng bản vẽ (Máy Nước, Hồ Cá, Giếng Phép Thuật, Tượng),
 * Cảnh Sát / treo thưởng, trang trí sảnh. Vào sảnh như người chơi, đứng cạnh từng món, bấm phím E thật, kiểm hộp thoại và tác dụng bằng số
 * (nghiên cứu bản vẽ trừ đúng vật liệu, Cầu Năng Lượng hồi 9 trong ván, đồ uống có hiệu ứng, tượng 300 -> 400, cá vào ván là vũ khí, treo thưởng cộng thưởng).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-hall4.js   (SK_URL để chạy trên Pages)
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-hall4/.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-hall4');
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
async function enterWalk(p) {
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 15000);
  await sleep(500);
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
}
// Trang mới với hồ sơ cho trước (null = hồ sơ trắng); chỉ gieo hồ sơ một lần mỗi phiên để tải lại trang giữ nguyên dữ liệu.
async function boot(profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await enterWalk(p);
  return p;
}
async function reload(p) { await p.goto(URL); await enterWalk(p); }
const dlgText = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
async function closeDlg(p) {
  await p.keyboard.press('Escape');
  await until(p, () => document.getElementById('hs-modal').hidden && !document.getElementById('sk-lobby').classList.contains('only-modes'), null, 2000);
  await sleep(350);
}
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
async function useSlot(p, slot) {
  const pos = await stand(p, slot);
  if (!pos) return null;
  await p.keyboard.press('KeyE');
  for (let i = 0; i < 4 && !await until(p, () => !document.getElementById('hs-modal').hidden, null, 1200); i++) await p.keyboard.press('KeyE');
  await until(p, () => !document.getElementById('hs-modal').hidden, null, 2000);
  await sleep(150);
  return dlgText(p);
}
async function startRun(p) {
  await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
  await p.keyboard.down('KeyW');
  await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
  await p.keyboard.up('KeyW');
  await p.click('#hs-mode-go');
  return until(p, () => SK.G.state === 'stage' && !!SK.G.player, null, 8000);
}
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});
const T = t => (t || '').replace(/\n/g, ' | ').slice(0, 150);
const prof = p => p.evaluate(() => ({ gems: SK.profile.gems, items: SK.profile.items(), forged: SK.profile.forged, carry: SK.profile.carry, devd: SK.profile.devdAll, stats: SK.profile.stats }));
const BPS = ['blueprint_room_decorate_drink_seller', 'blueprint_room_decorate_fishbowl', 'blueprint_room_decorate_magic_well', 'blueprint_room_decorate_mysteriou_statue'];
const RICH = { gems: 30000, welcomed: 1, won: { knight: 1 }, stats: { best: 7, pass: 2, dead: 1 }, unlocked: ['knight'],
  inv: Object.assign({ material_iron: 100, material_wood: 100, material_gear: 100, material_battery: 100, material_magic_blue: 20, material_magic_black: 20, material_magic_green: 20,
    material_magic_orange: 20, material_magic_purple: 20, material_magic_red: 20 }, Object.fromEntries(BPS.map(k => [k, 1]))) };
// Khoá lại số lượng thật rồi đổi nhân vật vào ván (hero hp/energy cơ bản) — đọc chỉ số người chơi đầu ván.
const pl = p => p.evaluate(() => { const q = SK.G.player, m = SK.G.mods || {}; return { hpMax: q.hpMax, hp: q.hp, armorMax: q.armorMax, energyMax: q.energyMax, crit: q.crit || 0, rate: q.rateMul == null ? 1 : q.rateMul,
  slots: m.buffSlots || 0, cd: m.skillCdMul || 1, move: m.moveMul || 1, milk: q._milk || 0, statues: q.statues && q.statues.slice(), weapons: q.weapons.map(w => w && w.id), factors: SK.G.factors.slice(), gold: q.gold }; });
async function endRun(p) {   // chết thật: trúng đòn chí mạng, chờ bảng kết quả (SK.emit('runEnd') do game phát)
  await p.evaluate(() => { const q = SK.G.player; q.god = false; for (let i = 0; i < 60 && q.st !== 'dead'; i++) { q.invulT = 0; SK.hurtPlayer(SK.G, 9999); } });   // đòn bị lọc (giáp, bộ lọc kỹ năng) nên đánh tới khi chết thật
  return until(p, () => SK.G.state === 'dead', null, 60000);
}

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 0. hồ sơ trắng: bốn nội thất khoá, Cảnh Sát khoá, vị trí món mới
    let p = await boot(null);
    const zs = await p.evaluate(() => SK.hall.zones());
    check('Giếng Phép Thuật (Vườn), Tượng, Cảnh Sát là món mới trong sảnh', ['magic_well', 'statue', 'officer'].every(s => zs.some(z => z.slot === s)), zs.filter(z => /well|statue|officer/.test(z.slot)).map(z => z.name + '@' + z.x + ',' + z.y).join(' '));
    const ov = zs.filter(a => ['magic_well', 'statue', 'officer'].includes(a.slot)).flatMap(a => zs.filter(b => b !== a && a.box[0] < b.box[2] && a.box[2] > b.box[0] && a.box[1] < b.box[3] && a.box[3] > b.box[1]).map(b => a.slot + '×' + b.slot));
    check('vùng tương tác món mới không đè lên món khác', !ov.length, ov.join(','));
    const lk = await p.evaluate(() => ['drink_seller', 'fish_bowl', 'magic_well', 'statue'].map(s => SK.HALL_LOCK(s)));
    check('chưa nghiên cứu: cả 4 nội thất đang khoá bản vẽ', lk.every(Boolean), JSON.stringify(lk));
    await p.evaluate(() => SK.hall.labelsAll(true));
    for (const [slot, name] of [['drink_seller', 'Máy Bán Nước Uống Tự Động'], ['fish_bowl', 'Hồ Cá'], ['magic_well', 'Giếng Phép Thuật'], ['statue', 'Tượng Tín Ngưỡng']]) {
      const t = await useSlot(p, slot);
      check(name + ' chưa có bản vẽ: hộp thoại "Cần bản vẽ"', t && t.indexOf(name) >= 0 && /Cần bản vẽ/.test(t) && /: chưa có/.test(t), T(t));
      if (slot === 'drink_seller') await shot(p, 'locked-drink');
      await closeDlg(p);
    }
    await stand(p, 'drink_seller'); await sleep(300); await shot(p, 'locked-drink-world');
    let t = await useSlot(p, 'officer');
    check('Cảnh Sát khi mới chơi: "Hãy tiếp tục khiêu chiến chế độ ải"', t && /Hãy tiếp tục khiêu chiến chế độ ải/.test(t), T(t));
    await closeDlg(p);
    await p.context().close();

    // ============ 1. nghiên cứu bản vẽ ở Bàn Thiết Kế: trừ đúng vật liệu, mở khoá món
    p = await boot(RICH);
    const costs = await p.evaluate(bps => bps.map(k => SK_FORGE.blueprints[k].mats), BPS);
    const before = await prof(p);
    t = await useSlot(p, 'station');
    check('Bàn Thiết Kế liệt kê 4 bản vẽ nội thất (tên Việt)', t && /Bản Vẽ Máy Bán Nước Uống Tự Động/.test(t) && /Bản Vẽ Hồ Cá/.test(t) && /Bản Vẽ Giếng Phép Thuật/.test(t) && /Bản Vẽ Tượng Tín Ngưỡng/.test(t), T(t));
    for (const bp of BPS) { await p.click('#sk-station li[data-k="' + bp + '"] button'); await sleep(200); }
    const after = await prof(p);
    const need = {}; for (const m of costs) for (const [k, n] of m) need[k] = (need[k] || 0) + n;
    const exp = Object.assign({}, before.items); for (const k of Object.keys(need)) if (k !== 'material_gem') exp[k] = (exp[k] || 0) - need[k];
    for (const k of BPS) delete exp[k];
    for (const k of Object.keys(exp)) if (!exp[k]) delete exp[k];
    check('nghiên cứu 4 bản vẽ: đá trừ ' + need.material_gem + ' và vật liệu trừ đúng công thức', before.gems - after.gems === need.material_gem && JSON.stringify(Object.entries(after.items).sort()) === JSON.stringify(Object.entries(exp).sort()),
      'gems ' + before.gems + '→' + after.gems + ' cần ' + JSON.stringify(need));
    const lk2 = await p.evaluate(() => ['drink_seller', 'fish_bowl', 'magic_well', 'statue'].map(s => SK.HALL_LOCK(s)));
    check('nghiên cứu xong: cả 4 nội thất mở', lk2.every(v => !v) && BPS.every(k => after.devd[k]), JSON.stringify(lk2));
    await closeDlg(p);
    await stand(p, 'drink_seller'); await sleep(300); await shot(p, 'unlocked-drink-world');

    // ============ 2. Giếng Phép Thuật: uống, vào ván, Cầu Năng Lượng hồi 9 (không uống: 8)
    await startRun(p);
    let base = await pl(p);
    const orb = async () => p.evaluate(() => { const q = SK.G.player; q.energy = 0; SK.dropPickup(SK.G, 'energy', q.x, q.y); return true; });
    await orb();
    await until(p, () => SK.G.player.energy > 0, null, 30000);
    const e8 = await p.evaluate(() => SK.G.player.energy);
    check('không uống giếng: Cầu Năng Lượng hồi 8', e8 === 8, 'energy=' + e8);
    await endRun(p);
    await reload(p);
    t = await useSlot(p, 'magic_well');
    check('Giếng Phép Thuật mở: hiện "Giếng nước trong lành" + nút Uống', t && /Giếng nước trong lành/.test(t) && /Uống/.test(t), T(t));
    await shot(p, 'well-dlg');
    await p.click('#sk-well-drink'); await sleep(200);
    t = await dlgText(p);
    check('uống xong: "Không uống được nữa", nút Uống tắt (một lần mỗi ván)', /Không uống được nữa/.test(t) && await p.evaluate(() => document.getElementById('sk-well-drink').disabled) && await p.evaluate(() => SK.hallExt.state().well === 1), T(t));
    await closeDlg(p);
    const g0 = (await prof(p)).gems;
    await startRun(p);
    check('vào ván: G.hallWell bật', await p.evaluate(() => SK.G.hallWell === true && SK.G.hallRun.well === true));
    await orb();
    await until(p, () => SK.G.player.energy > 0, null, 30000);
    const e9 = await p.evaluate(() => SK.G.player.energy);
    check('uống giếng: Cầu Năng Lượng hồi 9 trong ván', e9 === 9, 'energy=' + e9);
    await orb();
    await until(p, () => SK.G.player.energy > 0, null, 30000);
    check('buff giếng giữ cả ván (nhặt lần hai vẫn 9)', await p.evaluate(() => SK.G.player.energy === 9));
    await endRun(p);
    await reload(p);
    check('ván sau không còn buff giếng (dùng 1 lần mỗi ván)', await p.evaluate(() => SK.hallExt.state().well === 0));
    void g0; void base;

    // ============ 3. Máy Nước: mua đồ uống, mang vào ván
    const gA = (await prof(p)).gems;
    t = await useSlot(p, 'drink_seller');
    check('Máy Nước mở: lời thoại gốc + 4 ngăn', t && /hiệu quả gấp đôi/.test(t) && await p.evaluate(() => document.querySelectorAll('#sk-drinks li').length) === 4, T(t));
    await shot(p, 'drink-dlg');
    const stock = await p.evaluate(() => SK.hallExt.stock().map(q => q.k));
    const prices = await p.evaluate(() => SK.hallExt.stock().map(q => SK.hallExt.DRINKS[q.k].price));
    for (let i = 0; i < 3; i++) { await p.click('#sk-drinks li:nth-child(' + (i + 1) + ') button'); await sleep(150); }
    const gB = (await prof(p)).gems;
    check('mua 3 ly: đá trừ đúng ' + (prices[0] + prices[1] + prices[2]), gA - gB === prices[0] + prices[1] + prices[2], gA + '→' + gB + ' ' + stock.slice(0, 3));
    check('P.drinks giữ 3 ly vừa mua', await p.evaluate(d => JSON.stringify(SK.profile.drinks) === JSON.stringify(d), stock.slice(0, 3)));
    await p.click('#sk-drinks li:nth-child(4) button'); await sleep(150);
    t = await dlgText(p);
    check('ly thứ 4: "Thật sự không thể uống nữa", không trừ đá', /Thật sự không thể uống nữa/.test(t) && (await prof(p)).gems === gB, T(t));
    await closeDlg(p);
    // Số cộng của từng ly đo bằng chính hàm áp dụng khi vào ván (trên nhân vật giả hp 6, giáp 5, năng lượng 100), rồi cộng dồn cho 3 ly đã mua.
    const fx = await p.evaluate(() => { const o = {}; for (const k of Object.keys(SK.hallExt.DRINKS)) {
      const G = { mods: {} }, q = { hp: 6, hpMax: 6, armor: 5, armorMax: 5, energy: 100, energyMax: 100, crit: 0 };
      SK.hallExt.DRINKS[k].on(G, q); o[k] = { hpMax: q.hpMax - 6, armorMax: q.armorMax - 5, energyMax: q.energyMax - 100, crit: q.crit, rate: q.rateMul || 1, slots: G.mods.buffSlots || 0, cd: G.mods.skillCdMul || 1, move: G.mods.moveMul || 1, milk: q._milk || 0 }; } return o; });
    const heroBase = await p.evaluate(() => { const h = SK.DS.heroes.knight; return { hp: h.hp, armor: h.armor, energy: h.energy }; });
    await startRun(p);
    const dr = await pl(p);
    const dk = await p.evaluate(() => SK.G.hallRun.drinks);
    check('vào ván: G.hallRun.drinks = 3 ly đã mua, kho đồ uống về rỗng', JSON.stringify(dk) === JSON.stringify(stock.slice(0, 3)) && await p.evaluate(() => SK.profile.drinks.length === 0), JSON.stringify(dk));
    const want = { hpMax: heroBase.hp, armorMax: heroBase.armor, energyMax: heroBase.energy, crit: 0, rate: 1, slots: 0, cd: 1, move: 1, milk: 0 };
    for (const k of stock.slice(0, 3)) { const d = fx[k]; want.hpMax += d.hpMax; want.armorMax += d.armorMax; want.energyMax += d.energyMax; want.crit += d.crit; want.rate *= d.rate; want.slots += d.slots; want.cd *= d.cd; want.move *= d.move; want.milk += d.milk; }
    const same = Object.keys(want).every(k => Math.abs(dr[k] - want[k]) < 1e-9 || (k === 'crit' && dr.crit >= want.crit));
    check('3 ly (' + stock.slice(0, 3).join(', ') + ') có hiệu ứng khớp cộng dồn lên người chơi trong ván', same, JSON.stringify(dr) + ' kỳ vọng ' + JSON.stringify(want));
    await shot(p, 'drink-run');
    await endRun(p);
    await reload(p);
    check('11 loại đồ uống: số cộng đúng bảng', fx.wine.hpMax === 2 && fx.coconut.armorMax === 2 && fx.juice.energyMax === 80 && fx.bloody_mary.crit === 10 && fx.milk.milk === 1 && Math.abs(fx.coffee.rate - 1.2) < 1e-9 &&
      fx.tea.slots === 1 && Math.abs(fx.soda.cd - 0.8) < 1e-9 && fx.redbull.energyMax === 40 && Math.abs(fx.redbull.move - 1.1) < 1e-9 && fx.jade_elixir.hpMax === 2 && Math.abs(fx.jade_elixir.move - 0.9) < 1e-9 &&
      fx.garlic_juice.armorMax === 2 && fx.garlic_juice.hpMax === -1 && Object.keys(fx).length === 11, JSON.stringify(fx).slice(0, 200));

    // ============ 4. Tượng: 300 → 400 → 500 trong cùng ngày, tối đa 1300, chúc phúc vào ván, kích hoạt khi dùng kỹ năng
    const sg = (await prof(p)).gems;
    t = await useSlot(p, 'statue');
    check('Tượng mở: "Thờ tượng?" giá 300 lần đầu', t && /Thờ tượng\?/.test(t) && /300/.test(await p.evaluate(() => document.getElementById('sk-statue-price').innerText)), T(t));
    await shot(p, 'statue-dlg');
    await p.evaluate(() => { window.__r0 = SK.rand; const q = [0.05, 0.05, 0.35]; SK.rand = () => (q.length ? q.shift() : window.__r0()); });   // tượng 1, 1 (trùng), 4
    await p.click('#sk-statue-pray'); await sleep(200);
    t = await dlgText(p);
    const g1 = (await prof(p)).gems;
    check('thờ lần 1: trừ 300 đá, nhận chúc phúc (Cảm giác tràn đầy sức mạnh thần bí)', sg - g1 === 300 && /Cảm giác tràn đầy sức mạnh thần bí/.test(t), sg + '→' + g1 + ' ' + T(t));
    check('giá lần 2 cùng ngày = 400', /400/.test(await p.evaluate(() => document.getElementById('sk-statue-price').innerText)));
    await p.click('#sk-statue-pray'); await sleep(200);
    t = await dlgText(p);
    const g2 = (await prof(p)).gems;
    check('lần 2 trùng tượng đang có: "Đã có chúc phúc tượng này", không trừ đá', /Đã có chúc phúc tượng này/.test(t) && g2 === g1, T(t));
    await p.click('#sk-statue-pray'); await sleep(200);   // lần 3: ra tượng khác -> hỏi thay
    t = await dlgText(p);
    check('ra tượng khác thì hỏi thay thế', /Thay thế cho/.test(t), T(t));
    await p.click('#sk-statue-yes'); await sleep(200);
    const g3 = (await prof(p)).gems;
    check('thay: trừ đúng 400 đá', g2 - g3 === 400, g2 + '→' + g3);
    await p.evaluate(() => { SK.rand = window.__r0; });
    check('giá lần 3 cùng ngày = 500 (dailyCount 2)', /500/.test(await p.evaluate(() => document.getElementById('sk-statue-price').innerText)) && await p.evaluate(() => SK.profile.dailyCount('statue')) === 2);
    check('giá chặn trên 1300', await p.evaluate(() => { SK.profile.bumpDaily('statue', 20); const v = SK.hallExt.statuePrice(); SK.profile.bumpDaily('statue', -22); return v; }) === 1300);
    const sid = await p.evaluate(() => SK.hallExt.state().statue);
    await closeDlg(p);
    await startRun(p);
    const sr = await pl(p);
    check('vào ván: người chơi mang tượng đã chúc phúc', sr.statues && sr.statues[0] === sid && await p.evaluate(() => SK.G.player.statueCds[SK.G.player.statues[0]] === 0), JSON.stringify(sr.statues) + ' id=' + sid);
    await p.evaluate(() => { SK.G.phase = 'play'; SK.G.player.skillCd = 0; SK.G.player.energy = SK.G.player.energyMax; });
    const cd0 = await p.evaluate(() => SK.G.player.statueCds[SK.G.player.statues[0]]);
    await p.keyboard.press('Space'); await sleep(600);
    const cd1 = await p.evaluate(() => SK.G.player.statueCds[SK.G.player.statues[0]]);
    check('dùng kỹ năng (phím Space) kích hoạt tượng: hồi chiêu tượng > 0', cd0 === 0 && cd1 > 0, 'cd ' + cd0 + '→' + cd1);
    await endRun(p);
    await reload(p);

    // ============ 5. Hồ Cá: câu cá → vũ khí 1 ván
    await p.evaluate(() => { SK.profile.addGems(0); });
    t = await useSlot(p, 'fish_bowl');
    check('Hồ Cá mở: lời mô tả gốc + "Lần câu hôm nay còn: 6"', t && /Một bể cá lớn tuyệt đẹp/.test(t) && /Lần câu hôm nay còn:\s*6/.test(t), T(t));
    await p.click('#sk-fish-cast'); await sleep(200);
    check('Thả Câu hiện thanh câu + nút Thu Cần', await p.evaluate(() => !!document.getElementById('sk-fish-reel') && getComputedStyle(document.getElementById('sk-fish-bar')).display !== 'none'));
    await shot(p, 'fish-casting');
    // bấm lúc cá chưa tới nút -> cá trốn
    await until(p, () => !SK.hallExt.fish.state().inZone, null, 3000);
    await p.click('#sk-fish-reel'); await sleep(200);
    t = await dlgText(p);
    check('Thu Cần khi cá chưa trùng nút: "Cá trốn rồi", mất một lượt', /Cá trốn rồi/.test(t) && await p.evaluate(() => SK.profile.dailyCount('fishing')) === 1 && (await prof(p)).forged.length === 0, T(t));
    await p.evaluate(() => { window.__r0 = SK.rand; SK.rand = () => 0.5; });   // không ra rác
    await p.click('#sk-fish-cast'); await sleep(200);
    await until(p, () => SK.hallExt.fish.state().inZone, null, 5000);
    await p.click('#sk-fish-reel'); await sleep(250);
    t = await dlgText(p);
    const fp = await prof(p), fid = fp.forged[0];
    check('Thu Cần đúng lúc: câu được cá (vũ khí) vào ô đồ rèn và tự chọn mang theo', /Bạn câu được/.test(t) && fp.forged.length === 1 && fp.carry && fp.carry.id === fid && fp.carry.from === 'forged', T(t) + ' forged=' + fp.forged);
    check('cá câu được thuộc bảng cá (tên có Cá)', await p.evaluate(id => SK.hallExt.fish.state().list.includes(id) && /Cá/.test(SK.DS.weapons[id].name), fid), fid);
    await p.evaluate(() => { SK.rand = window.__r0; });
    await shot(p, 'fish-caught');
    await closeDlg(p);
    await startRun(p);
    const fr = await pl(p);
    check('vào ván: cá là vũ khí ở ô thứ hai', fr.weapons.includes(fid), JSON.stringify(fr.weapons) + ' cá=' + fid);
    await endRun(p);
    await reload(p);
    check('cá dùng một ván: ván sau không còn trong ô đồ rèn', (await prof(p)).forged.length === 0 && (await prof(p)).carry === null);

    // ============ 6. Cảnh Sát / treo thưởng
    t = await useSlot(p, 'officer');
    check('Cảnh Sát (đã chơi 3 ván): hiện lời gốc + 3 việc', t && /Treo thưởng mới ra lò/.test(t) && await p.evaluate(() => document.querySelectorAll('#sk-off-list li').length) === 3, T(t));
    await shot(p, 'officer-dlg');
    const offers = await p.evaluate(() => SK.hallExt.state().quest.offers);
    const o0 = offers[0], tier0 = await p.evaluate(t => SK.hallExt.quest.TIER[t], o0.tier);
    check('việc 1 là nhiệm vụ đánh bại, dùng nhân tố có sẵn trong SK.FACTORS', o0.type === 'defeat' && await p.evaluate(f => !!SK.FACTORS[f], o0.factor), JSON.stringify(o0));
    await p.click('#sk-off-list li:nth-child(1) button'); await sleep(200);
    t = await dlgText(p);
    check('nhận việc 1: hiện "Đang nhận" + nút Hủy', /Đang nhận/.test(t) && await p.evaluate(() => !!document.getElementById('sk-off-cancel')), T(t));
    await closeDlg(p);
    await startRun(p);
    const qr = await pl(p);
    check('vào ván Ải: nhân tố của việc được gắn tự động', qr.factors.includes(o0.factor), JSON.stringify(qr.factors));
    // chưa đủ chỉ tiêu: chết ngay -> chưa xong
    await endRun(p);
    await reload(p);
    check('ván không đạt chỉ tiêu (0 quái): việc chưa xong', await p.evaluate(() => SK.hallExt.state().quest.active.done === false));
    await startRun(p);
    await p.evaluate(n => { SK.G.kills = n; }, o0.target);
    await endRun(p);
    const dbg = await p.evaluate(() => JSON.stringify({ kills: SK.G.kills, mode: SK.G.mode, f: SK.G.factors, a: SK.hallExt.state().quest.active }));
    await reload(p);
    check('ván hạ đủ ' + o0.target + ' quái: việc chuyển sang "đã xong"', await p.evaluate(() => SK.hallExt.state().quest.active.done === true), dbg);
    const gq = await prof(p);
    t = await useSlot(p, 'officer');
    check('Cảnh Sát báo hoàn thành + hiện thưởng', t && /Không ngờ bạn đã hoàn thành treo thưởng/.test(t) && /Nhận thưởng/.test(t), T(t));
    await p.click('#sk-off-claim'); await sleep(250);
    const gq2 = await prof(p);
    const matGain = ['material_iron', 'material_wood', 'material_gear'].reduce((a, k) => a + (gq2.items[k] || 0) - (gq.items[k] || 0), 0);
    check('nhận thưởng: +' + tier0.gems + ' đá, +' + tier0.mat + ' vật liệu', gq2.gems - gq.gems === tier0.gems && matGain === tier0.mat, 'đá ' + gq.gems + '→' + gq2.gems + ' vl +' + matGain);
    t = await dlgText(p);
    check('lời "Đây là thưởng của bạn"', /Đây là thưởng của bạn/.test(t), T(t));
    check('xong: việc đã nhận được xoá, đếm hôm nay 1/3, bộ việc mới', await p.evaluate(() => { const q = SK.hallExt.state().quest; return q.active === null && q.claimed === 1 && q.offers.length === 3; }));
    // việc thu thập
    await closeDlg(p);
    t = await useSlot(p, 'officer');
    await p.click('#sk-off-list li:nth-child(2) button'); await sleep(200);
    const act2 = await p.evaluate(() => SK.hallExt.state().quest.active);
    check('việc 2 là nhiệm vụ thu thập vàng', act2 && act2.type === 'collect', JSON.stringify(act2));
    await closeDlg(p);
    await startRun(p);
    await p.evaluate(n => { SK.G.player.gold = n; }, act2.target);
    await endRun(p);
    await reload(p);
    check('thu thập đủ ' + act2.target + ' vàng: việc chuyển sang "đã xong"', await p.evaluate(() => SK.hallExt.state().quest.active.done === true));
    const gq3 = await prof(p);
    const tier2 = await p.evaluate(t => SK.hallExt.quest.TIER[t], act2.tier);
    t = await useSlot(p, 'officer');
    await p.click('#sk-off-claim'); await sleep(250);
    const gq4 = await prof(p);
    const bpGain = BPS.filter(k => (gq4.items[k] || 0) > (gq3.items[k] || 0));
    check('nhận thưởng việc 2: +' + tier2.gems + ' đá' + (tier2.bp ? ' và 1 bản vẽ nội thất' : ''), gq4.gems - gq3.gems === tier2.gems && (tier2.bp ? bpGain.length === 1 : true), 'đá ' + gq3.gems + '→' + gq4.gems + ' bp=' + bpGain);
    await closeDlg(p);
    await p.context().close();

    // ============ 7. bản vẽ nội thất rơi ở treo thưởng khó (nguồn bản vẽ)
    p = await boot({ gems: 100, welcomed: 1, won: { knight: 1 }, stats: { best: 7, pass: 5, dead: 0 }, unlocked: ['knight'] });
    const hard = await p.evaluate(() => { const T = SK.hallExt.quest.TIER; return { tier: Object.keys(T).find(k => T[k].bp), bp: T['khó'] && T['khó'].bp }; });
    check('chỉ treo thưởng độ khó "khó" thưởng bản vẽ nội thất', hard.tier === 'khó' && hard.bp === true);
    const bpGot = await p.evaluate(() => {
      const q = SK.hallExt.quest.sync();
      q.active = { id: 'x', type: 'defeat', factor: Object.keys(SK.FACTORS).find(k => SK.FACTORS[k].tier === 'khó'), tier: 'khó', target: 1, done: true };
      const r = SK.hallExt.quest.claim(); return r && r.bp;
    });
    check('treo thưởng khó nhận được 1 trong 4 bản vẽ nội thất chưa có', BPS.includes(bpGot), String(bpGot));
    await p.context().close();

    // ============ 8. lỗi trang
    check('không có lỗi trang / http 4xx', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    check('chạy bộ kiểm không ngoại lệ', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
  }
  console.log(out.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
