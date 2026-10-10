/*
 * Khu Vườn của sảnh Hiệp Sĩ Linh Hồn, bước 6 của games/soulknight/tools/polish/HALL.md: 8 ô trồng (prefab gốc plant_pot_0_summer), Bình Nước, Phân Bón,
 * Xẻng và 47 loại cây (data/sk-garden.js, js/garden.js). Vào sảnh như người chơi, đi tới ô trồng, bấm phím E thật, kiểm hộp thoại và tác dụng bằng số:
 * hạt trừ 1, tưới + qua ngày (SK.garden.debugNextDay) mới lớn, thu đúng sản phẩm, cây Vĩnh viễn thu lại, Phân Bón lớn không cần tưới, mở ô trồng trừ đá,
 * buff cây vào ván kế mà không chiếm ô thiên phú.
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-garden.js   (SK_URL để chạy trên Pages)
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-garden/.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-garden');
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
async function boot(profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 15000);
  await sleep(500);
  await toWalk(p);
  return p;
}
async function toWalk(p) {
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
}
const dlgText = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
const flat = t => (t || '').replace(/\n/g, ' | ');
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
const G = p => p.evaluate(() => SK.garden.state());
const inv = p => p.evaluate(() => ({ gems: SK.profile.gems, items: SK.profile.items(), box: SK.profile.box }));
const click = async (p, sel) => { await p.click(sel); await sleep(120); };
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});
const btnOn = (p, sel) => p.evaluate(s => { const b = document.querySelector(s); return !!b && !b.disabled; }, sel);
async function startRun(p) {
  await p.evaluate(() => { const s = SK.hallState, d = SK.hall.state.door; s.me.x = d.x; s.me.y = d.y - 4; });
  await p.keyboard.down('KeyW');
  await until(p, () => !document.getElementById('hs-modes').hidden, null, 4000);
  await p.keyboard.up('KeyW');
  await p.click('#hs-mode-go');
  return until(p, () => SK.G.state === 'stage' && !!SK.G.player, null, 8000);
}
// Một ngày: tưới hết ô rồi qua đêm.
const dayWith = async (p, i) => { await p.evaluate(i => { SK.garden.water(i); SK.garden.debugNextDay(); }, i); };

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 0. dữ liệu + bố trí trong sảnh
    let p = await boot({ gems: 20000, welcomed: 1, unlocked: ['knight'], inv: { plant_tree_seed: 2, plant_gem_tree_seed: 2, plant_radar_seed: 2, material_fertilize: 3 } });
    const D0 = await p.evaluate(() => {
      const pl = SK_GARDEN.plants, ks = Object.keys(pl), seeds = Object.keys(SK_ITEMS.items).filter(k => /^plant_.*_seed$/.test(k));
      const noFrame = ks.filter(k => pl[k].stages.some((s, i) => !s && i > 0 || (s && !SK.frame(s)))).length;
      return { n: ks.length, seedsMatch: seeds.length === ks.length && seeds.every(k => pl[k]), noFrame, kinds: [...new Set(ks.map(k => pl[k].product.kind))].sort(), plots: SK_GARDEN.plots.map(c => c.kind),
        oak: pl.plant_tree_seed, gt: pl.plant_gem_tree_seed, radar: pl.plant_radar_seed, vine: pl.plant_vine_seed };
    });
    check('47 cây khớp 47 hạt trong kho, mọi giai đoạn có khung trong atlas', D0.n === 47 && D0.seedsMatch && D0.noFrame === 0, 'n=' + D0.n + ' khung thiếu=' + D0.noFrame);
    check('Cây Sồi: 3 ngày, Nhanh, 10 Gỗ; Cây Đá: 4 ngày, Vĩnh viễn, 222 đá; Hoa Radar: thiên phú id 2', D0.oak.days === 3 && D0.oak.harvest === 'once' && D0.oak.product.key === 'material_wood' && D0.oak.product.n === 10 &&
      D0.gt.days === 4 && D0.gt.harvest === 'perm' && D0.gt.product.kind === 'gems' && D0.gt.product.n === 222 && D0.radar.product.kind === 'buff' && D0.radar.product.id === 2, JSON.stringify([D0.oak.product, D0.gt.product, D0.radar.product]));
    check('8 ô: 3 miễn phí, 5000 đá, $1, $2, thành tựu, $2', JSON.stringify(D0.plots) === JSON.stringify(['free', 'free', 'free', 'gems', 'money', 'money', 'achievement', 'money']), D0.plots.join(','));
    const zs = await p.evaluate(() => SK.hall.zones().filter(z => /^garden_/.test(z.slot)));
    check('sảnh có 8 ô trồng + Bình Nước + Phân Bón + Xẻng (nhãn Việt), ô trồng dựng từ prefab gốc', zs.filter(z => /^garden_plot_/.test(z.slot)).length === 8 && ['Bình Nước', 'Phân Bón', 'Xẻng'].every(n => zs.some(z => z.name === n)) && zs.every(z => !z.kiosk), zs.map(z => z.name).join(', '));
    const allz = await p.evaluate(() => SK.hall.zones());
    const ov = zs.flatMap(a => allz.filter(b => b.slot !== a.slot && a.box[0] < b.box[2] && a.box[2] > b.box[0] && a.box[1] < b.box[3] && a.box[3] > b.box[1]).map(b => a.slot + '×' + b.slot));
    check('vùng tương tác vườn không đè lên nhau hay món khác', !ov.length, ov.join(','));
    await p.evaluate(() => { const z = SK.hall.zones().find(q => q.slot === 'garden_plot_1'); const m = SK.hallState.me; m.x = z.x + 3; m.y = z.y - 1; });
    await sleep(400); await shot(p, 'garden-empty');

    // ============ 1. trồng Cây Sồi, không tưới thì không lớn
    let t = await useSlot(p, 'garden_plot_0');
    check('E ở ô trồng: "Hãy chọn 1 hạt giống" + Cây Sồi với Sản xuất / Loại thu hoạch / Chu kỳ', /Vườn Hoa 1/.test(t) && /Hãy chọn 1 hạt giống/.test(t) && /Cây Sồi/.test(t) && /Sản xuất: Gỗ ×10/.test(t) && /Loại thu hoạch: Nhanh/.test(t) && /Chu kỳ sinh trưởng: 3 ngày/.test(t), flat(t).slice(0, 220));
    await shot(p, 'dlg-seeds');
    await click(p, '#sk-gd-seeds li[data-k="plant_tree_seed"] button');
    let g = await G(p), v = await inv(p);
    check('trồng Cây Sồi: hạt trừ 1 (2→1), ô có cây ở giai đoạn 0, nhắc phải tưới', v.items.plant_tree_seed === 1 && g.plots[0].seed === 'plant_tree_seed' && g.plots[0].stage === 0 && /tưới/.test(await dlgText(p) || ''), JSON.stringify({ seed: v.items.plant_tree_seed, p0: g.plots[0] }));
    await shot(p, 'dlg-planted');
    await closeDlg(p);
    await p.evaluate(() => SK.garden.debugNextDay());
    g = await G(p);
    check('không tưới thì qua đêm cây không lớn', g.plots[0].stage === 0, 'stage=' + g.plots[0].stage);

    // ============ 2. tưới + 3 đêm → 10 Gỗ, ô trống lại
    t = await useSlot(p, 'garden_plot_0');
    await click(p, '#sk-gd-water');
    g = await G(p);
    check('nút Tưới: ô đã tưới, chưa lớn trước khi qua đêm', g.plots[0].watered === true && g.plots[0].stage === 0 && !(await btnOn(p, '#sk-gd-water')), JSON.stringify(g.plots[0]));
    await closeDlg(p);
    await p.evaluate(() => SK.garden.debugNextDay());
    g = await G(p);
    check('qua đêm 1: lớn một giai đoạn và hết nước', g.plots[0].stage === 1 && g.plots[0].watered === false, JSON.stringify(g.plots[0]));
    await dayWith(p, 0); await dayWith(p, 0);
    g = await G(p);
    check('tưới + 3 đêm: Cây Sồi đã chín (giai đoạn 3)', g.plots[0].stage === 3, 'stage=' + g.plots[0].stage);
    t = await useSlot(p, 'garden_plot_0');
    check('hộp thoại ô chín: "Đã chín" và nút Thu hoạch bật', /Đã chín/.test(t) && await btnOn(p, '#sk-gd-harvest'), flat(t).slice(0, 160));
    await shot(p, 'dlg-ripe');
    v = await inv(p);
    await click(p, '#sk-gd-harvest');
    let v2 = await inv(p); g = await G(p);
    check('thu hoạch Cây Sồi: đúng +10 Gỗ, ô trống lại', (v2.items.material_wood | 0) - (v.items.material_wood | 0) === 10 && g.plots[0].seed === null, 'gỗ ' + (v.items.material_wood | 0) + '→' + (v2.items.material_wood | 0) + ' · ' + flat(await dlgText(p)).slice(-90));
    await closeDlg(p);

    // ============ 3. Cây Đá (Vĩnh viễn): thu xong cây còn, tưới tiếp mai thu lại
    t = await useSlot(p, 'garden_plot_1');
    await click(p, '#sk-gd-seeds li[data-k="plant_gem_tree_seed"] button');
    await closeDlg(p);
    for (let i = 0; i < 4; i++) await dayWith(p, 1);
    g = await G(p);
    check('Cây Đá: tưới 4 đêm mới chín (giai đoạn 4)', g.plots[1].stage === 4, 'stage=' + g.plots[1].stage);
    v = await inv(p);
    t = await useSlot(p, 'garden_plot_1');
    await click(p, '#sk-gd-harvest');
    v2 = await inv(p); g = await G(p);
    check('thu Cây Đá: +222 đá, cây còn (giai đoạn 3)', v2.gems - v.gems === 222 && g.plots[1].seed === 'plant_gem_tree_seed' && g.plots[1].stage === 3, 'đá ' + v.gems + '→' + v2.gems + ' ' + JSON.stringify(g.plots[1]));
    check('Cây Đá chưa tưới thì chưa thu lại được', !(await btnOn(p, '#sk-gd-harvest')));
    await closeDlg(p);
    await dayWith(p, 1);
    t = await useSlot(p, 'garden_plot_1');
    await click(p, '#sk-gd-harvest');
    const v3 = await inv(p);
    check('tưới tiếp, mai thu lại: +222 đá nữa, cây vẫn còn', v3.gems - v2.gems === 222 && (await G(p)).plots[1].seed === 'plant_gem_tree_seed', 'đá ' + v2.gems + '→' + v3.gems);
    await closeDlg(p);

    // ============ 4. Phân Bón: lớn không cần tưới (ở lần ghé sau); buff Hoa Radar
    t = await useSlot(p, 'garden_plot_2');
    await click(p, '#sk-gd-seeds li[data-k="plant_radar_seed"] button');
    await click(p, '#sk-gd-fert');
    g = await G(p); v = await inv(p);
    check('bón phân: Phân Bón 3→2, đã bón nhưng chưa lớn tới lần ghé sau, chưa tưới', v.items.material_fertilize === 2 && g.plots[2].fert === true && g.plots[2].stage === 0 && !g.plots[2].watered, JSON.stringify(g.plots[2]));
    await closeDlg(p);
    await p.evaluate(() => SK.garden.visit());
    g = await G(p);
    check('lần ghé sau: cây bón phân lớn một giai đoạn, không cần tưới (Hoa Radar chín)', g.plots[2].stage === 1 && !g.plots[2].fert, JSON.stringify(g.plots[2]));
    t = await useSlot(p, 'garden_plot_2');
    await click(p, '#sk-gd-harvest');
    g = await G(p);
    check('thu Hoa Radar: thiên phú 2 (Tia Năng Lượng Cao) chờ vào ván kế, ô trống', g.buffs.join() === '2' && g.plots[2].seed === null && /Tia Năng Lượng Cao/.test(await dlgText(p) || ''), flat(await dlgText(p)).slice(-110));
    await closeDlg(p);
    // trùng buff đang có -> không thu
    await p.evaluate(() => { SK.profile.addItem('plant_radar_seed', 1); SK.garden.plant(2, 'plant_radar_seed'); SK.garden.water(2); SK.garden.debugNextDay(); });
    t = await useSlot(p, 'garden_plot_2');
    await click(p, '#sk-gd-harvest');
    g = await G(p);
    check('trùng buff đang có: báo "Bạn đã có buff này", không thu, cây giữ nguyên', /Bạn đã có buff này/.test(await dlgText(p) || '') && g.buffs.length === 1 && g.plots[2].seed === 'plant_radar_seed', flat(await dlgText(p)).slice(-90));
    await closeDlg(p);
    // không đủ phân bón
    await p.evaluate(() => SK.profile.spendItem('material_fertilize', SK.profile.item('material_fertilize')));
    t = await useSlot(p, 'garden_fert');
    check('Bao Phân Bón hết phân: "Không đủ phân bón"', /Không đủ phân bón/.test(t), flat(t).slice(0, 120));
    await closeDlg(p);
    // Bình Nước tưới cả vườn
    await p.evaluate(() => { SK.profile.addItem('plant_tree_seed', 1); SK.garden.plant(0, 'plant_tree_seed'); });
    t = await useSlot(p, 'garden_can');
    check('Bình Nước: đếm ô cần nước (Cây Đá, Sồi) rồi "Tưới tất cả"', /Ô đang cần nước:\s*2/.test(t), flat(t).slice(0, 140));
    await click(p, '#sk-gd-water-all');
    g = await G(p);
    check('Tưới tất cả: mọi ô có cây cần nước đều đã tưới', g.plots[0].watered && g.plots[1].watered && /Đã tưới 2 ô/.test(await dlgText(p) || ''), JSON.stringify(g.plots.slice(0, 3).map(q => q.watered)));
    await closeDlg(p);
    await p.evaluate(() => { const z = SK.hall.zones().find(q => q.slot === 'garden_plot_1'); const m = SK.hallState.me; m.x = z.x + 3; m.y = z.y - 1; });
    await sleep(400); await shot(p, 'garden-planted');

    // ============ 5. buff cây vào ván kế, không chiếm ô thiên phú
    const started = await startRun(p);
    const R = await p.evaluate(() => ({ buffs: SK.G.player.buffs.slice(), mods: SK.G.mods && SK.G.mods.buffSlots, slots: SK.ROOMS.buffSlots(), base: SK.ROOMS.BUFF_SLOTS, name: SK.ROOMS.buffName(2), garden: SK.garden.state().buffs, run: SK.G.gardenRun }));
    check('vào ván: Hoa Radar cho thiên phú 2 (Tia Năng Lượng Cao) có sẵn', started && R.buffs.indexOf(2) >= 0 && R.name === 'Tia Năng Lượng Cao', JSON.stringify(R));
    check('buff cây không chiếm ô: số ô thiên phú +1; hàng chờ trống sau khi dùng', R.slots === R.base + 1 && R.mods === 1 && R.garden.length === 0, 'ô ' + R.slots + ' (gốc ' + R.base + ')');
    await p.context().close();

    // ============ 6. mở ô trồng
    p = await boot({ gems: 4999, welcomed: 1, unlocked: ['knight'] });
    t = await useSlot(p, 'garden_plot_3');
    check('ô 4 đang khoá: hiện giá 5000 đá, thiếu đá thì nút Mở khóa tắt', /Vườn Hoa 4/.test(t) && /5[.,\s]?000/.test(t) && !(await btnOn(p, '#sk-gd-unlock')), flat(t).slice(0, 140));
    await shot(p, 'dlg-locked');
    await closeDlg(p);
    await p.evaluate(() => SK.profile.addGems(1));
    t = await useSlot(p, 'garden_plot_3');
    let g0 = (await inv(p)).gems;
    await click(p, '#sk-gd-unlock');
    g = await G(p);
    check('mở ô 4: trừ đúng 5000 đá, ô mở', g0 === 5000 && (await inv(p)).gems === 0 && g.open[3] === true, 'đá ' + g0 + '→' + (await inv(p)).gems);
    await closeDlg(p);
    t = await useSlot(p, 'garden_plot_4');
    check('ô 5: $1 qua thanh toán giả, mở sau khi xác nhận', /\$1\.00/.test(t) && /không trừ tiền thật/.test(t), flat(t).slice(0, 120));
    await click(p, '#sk-gd-unlock');
    check('hộp thanh toán giả hiện cho ô 5', /Thanh toán giả lập — không trừ tiền thật/.test(await dlgText(p) || ''), flat(await dlgText(p)).slice(0, 100));
    await click(p, '#hs-pay-ok');
    check('xác nhận: ô 5 mở', (await G(p)).open[4] === true);
    await closeDlg(p);
    t = await useSlot(p, 'garden_plot_6');
    check('ô 7 khoá theo thành tựu "Tường Than Thở", không có nút mở', /Tường Than Thở/.test(t) && !(await p.evaluate(() => !!document.getElementById('sk-gd-unlock'))), flat(t).slice(0, 200));
    await closeDlg(p);
    await p.context().close();

    // ============ 7. cây days 0 (Dây Leo), Xẻng, cây chưa có luật, thú cưng
    p = await boot({ gems: 0, welcomed: 1, unlocked: ['knight'], inv: { plant_vine_seed: 2, plant_rosemary_seed: 1, plant_zongzi_seed: 1, plant_mushroom_seed: 1 } });
    await p.evaluate(() => { SK.garden.plant(0, 'plant_vine_seed'); SK.garden.water(0); });
    t = await useSlot(p, 'garden_plot_0');
    g = await G(p);
    check('Dây Leo (days 0): tưới xong mở lại hộp thoại vẫn chưa lớn (đợi lần ghé sau)', g.plots[0].stage === 0 && /chưa|tưới/.test(t || ''), JSON.stringify(g.plots[0]));
    await closeDlg(p);
    await p.evaluate(() => SK.garden.visit());
    g = await G(p);
    check('lần ghé sau: Dây Leo chín', g.plots[0].stage === 1, JSON.stringify(g.plots[0]));
    t = await useSlot(p, 'garden_plot_0');
    await click(p, '#sk-gd-harvest');
    const w = await p.evaluate(() => ({ box: SK.profile.box, vine: SK.DS.weaponId('weapon_208') }));
    check('thu Dây Leo: vũ khí vào hòm vũ khí', w.box.indexOf(w.vine) >= 0 && (await G(p)).plots[0].seed === null, JSON.stringify(w));
    await closeDlg(p);
    // Xẻng
    await p.evaluate(() => { SK.garden.plant(1, 'plant_vine_seed'); });
    t = await useSlot(p, 'garden_shovel');
    check('Xẻng liệt kê cây đang trồng', /Xẻng/.test(t) && /Dây Leo/.test(t) && /Vườn Hoa 2/.test(t), flat(t).slice(0, 120));
    await click(p, '#sk-gd-shovels button');
    check('Xẻng hỏi lại "Bỏ cây này thật sao?"', /Bỏ cây này thật sao\?/.test(await dlgText(p) || ''));
    await click(p, '#sk-gd-shovel-yes');
    g = await G(p); v = await inv(p);
    check('Bỏ cây: ô trống, hạt không hoàn lại', g.plots[1].seed === null && (v.items.plant_vine_seed | 0) === 0, JSON.stringify({ p1: g.plots[1], vine: v.items.plant_vine_seed }));
    await closeDlg(p);
    // thiên phú chưa có luật ở bản web (Hương Thảo / Holy Nova): cây chín nhưng không thu, không mất cây
    await p.evaluate(() => { SK.garden.plant(1, 'plant_rosemary_seed'); SK.garden.water(1); SK.garden.debugNextDay(); });
    t = await useSlot(p, 'garden_plot_1');
    await click(p, '#sk-gd-harvest');
    g = await G(p);
    check('Hương Thảo (thiên phú chưa có luật): báo "chưa có ở bản web", cây giữ nguyên', /chưa có ở bản web/.test(await dlgText(p) || '') && g.plots[1].seed === 'plant_rosemary_seed' && !g.buffs.length, flat(await dlgText(p)).slice(-80));
    await closeDlg(p);
    // thú cưng đi kèm: Hoa Bánh Ú
    await p.evaluate(() => { SK.garden.plant(2, 'plant_zongzi_seed'); SK.garden.water(2); SK.garden.debugNextDay(); });
    t = await useSlot(p, 'garden_plot_2');
    await click(p, '#sk-gd-harvest');
    g = await G(p);
    check('thu Hoa Bánh Ú: thú cưng chờ vào ván kế', g.pets.join() === 'plant_zongzi' && g.plots[2].seed === null, JSON.stringify(g.pets));
    await closeDlg(p);
    const run = await startRun(p);
    const P2 = await p.evaluate(() => ({ main: SK.G.pet && SK.G.pet.id, comps: SK.G.props.filter(q => q.gardenPet).map(q => q.gardenPet.plant), left: SK.garden.state().pets }));
    check('vào ván: thú cưng chính còn nguyên, Bánh Ú đi kèm thêm một con, hàng chờ trống', run && !!P2.main && P2.comps.join() === 'plant_zongzi' && P2.left.length === 0, JSON.stringify(P2));
    await shot(p, 'run-with-garden-pet');
    await p.context().close();

    // ============ 8. lưu qua tải lại trang
    p = await boot({ gems: 0, welcomed: 1, unlocked: ['knight'], inv: { plant_tree_seed: 1 } });
    await p.evaluate(() => { SK.garden.plant(0, 'plant_tree_seed'); SK.garden.water(0); SK.garden.debugNextDay(); });
    const before = await G(p);
    await p.reload();
    await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 15000);
    const after = await G(p);
    check('tải lại trang: cây và giai đoạn vẫn còn trong hồ sơ', after.plots[0].seed === 'plant_tree_seed' && after.plots[0].stage === before.plots[0].stage, JSON.stringify(after.plots[0]));
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
