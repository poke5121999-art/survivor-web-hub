/*
 * Kiểm thử kho đồ + HUD + bảng của Season Mode (games/soulknight/js/season/inventory.js, ui.js, quests.js).
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-season-ui.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-season-ui/  (khung 1386x640 = đúng cỡ ảnh chụp của chủ dự án).
 *
 * Chạy mode thật (SK.SEASON.start), dùng phím/chuột thật cho HUD và bảng; dùng móc SK.SEASON.debug của world để
 * dịch chuyển / giết quái / tua bước cho nhanh.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-season-ui');
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
// Toạ độ đơn vị UI -> px CSS (khung 640 cao, dpr 1 -> d = 2).
const U = (x, y) => [x * 2, y * 2];
// Dịch tới cổng xoáy rồi giữ W bước vào (cổng bắt khi cách < 16 px).
async function deploy(p) {
  await p.evaluate(() => SK.SEASON.debug.tpTo('portal'));
  await p.keyboard.down('KeyW');
  const ok = await until(p, () => SK.G.season.mode !== 'base', null, 3000);
  await p.keyboard.up('KeyW');
  return ok && until(p, () => SK.G.season.mode === 'expedition', null, 8000);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1386, height: 640 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  await p.goto(URL);
  await p.evaluate(() => { try { localStorage.removeItem('sk.season.v1'); } catch (_) { /* */ } });
  await p.reload();
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.evaluate(async () => { await document.fonts.ready; try { await document.fonts.load('800 16px Nunito', 'Balô'); } catch (_) { /* offline */ } });

  // ---- dữ liệu
  const data = await p.evaluate(() => {
    const S = SK.SEASON, it = S.items;
    const data = {
      n: Object.keys(it).length,
      noIcon: Object.values(it).filter(x => !SK.frame(x.icon)).map(x => x.id),
      pot: it.healing_potion_s && [it.healing_potion_s.icon, it.healing_potion_s.effect.hp, it.healing_potion_s.stack],
      byPixel: Object.values(it).filter(x => /^pixel/.test(x.iconBy)).length,
      weapon: S.itemDef('w_bad_pistol') && S.itemDef('w_bad_pistol').type,
      loot: ['resource', 'food', 'medical', 'supply', 'misc', 'monster'].map(t => [t, S.loot(t, 1, { weapon: 'ak_47' })])
    };
    data.valid = data.loot.every(([t, l]) => l.every(x => !!S.itemDef(x.id)));
    return data;
  });
  check('bảng vật phẩm đủ + mọi món có icon trong atlas', data.n >= 108 && !data.noIcon.length, data.n + ' món, ' + data.byPixel + ' ghép bằng điểm ảnh, thiếu icon: ' + data.noIcon.join(','));
  check('Healing Potion (S) = Item_20, hồi 3, chồng 5', data.pot && data.pot[0] === 'sitem/Item_20' && data.pot[1] === 3 && data.pot[2] === 5, JSON.stringify(data.pot));
  check('loot() trả đồ có thật cho 6 loại thùng', data.valid &&
    data.loot.find(x => x[0] === 'monster')[1].some(x => x.id === 'w_ak_47'), data.loot.map(([t, l]) => t + ':' + l.map(x => x.id + 'x' + x.n).join('+')).join(' | '));

  // ---- vào mode thật
  const started = await p.evaluate(() => SK.SEASON.start('knight'));
  await until(p, () => SK.G.state === 'season' && SK.G.player && SK.SEASON.ui, null, 5000);
  await sleep(700);
  const st0 = await p.evaluate(() => { const pl = SK.G.player, h = SK.DS.heroes.knight; return { want: h.hp + 2 * h.armor, hp: pl.hp, hpMax: pl.hpMax, armorMax: pl.armorMax, w: SK.SEASON.inv.state.equip.weapon1 && SK.SEASON.inv.state.equip.weapon1.id, hunger: SK.SEASON.inv.state.hunger }; });
  check('vào Season: máu = máu gốc + 2 x giáp gốc, giáp 0, vũ khí khởi đầu, no 100', started && st0.hpMax === st0.want && st0.hp === st0.want && st0.armorMax === 0 && st0.w === 'w_bad_pistol' && st0.hunger === 100, JSON.stringify(st0));
  await p.screenshot({ path: path.join(SHOTS, 'hud_base.png') });

  // ---- thêm đồ, chồng
  const add = await p.evaluate(() => {
    const I = SK.SEASON.inv;
    const l1 = I.add('healing_potion_s', 3), l2 = I.add('healing_potion_s', 4), l3 = I.add('energy_potion_s', 2);
    return { l1, l2, l3, cnt: I.count('healing_potion_s'), stacks: I.state.backpack.filter(s => s && s.id === 'healing_potion_s').map(s => s.n), quick: I.state.quick.slice() };
  });
  check('add() gộp chồng 5 + tự gắn ô tiêu hao', add.l1 === 0 && add.l2 === 0 && add.cnt === 7 && add.stacks.join() === '5,2' && add.quick[0] === 'healing_potion_s', JSON.stringify(add));

  // ---- quá tải -> chậm (đo bằng đi thật)
  async function walk(ms) {
    const a = await p.evaluate(() => [SK.G.player.x, SK.G.player.y]);
    await p.keyboard.down('KeyD'); await sleep(ms); await p.keyboard.up('KeyD');
    const c = await p.evaluate(() => [SK.G.player.x, SK.G.player.y]);
    return Math.hypot(c[0] - a[0], c[1] - a[1]);
  }
  await p.evaluate(() => SK.SEASON.debug.tpTo('building', 'store'));
  const light = await walk(600);
  await p.evaluate(() => SK.SEASON.debug.tpTo('building', 'store'));
  await p.evaluate(() => { for (let i = 0; i < 6; i++) SK.SEASON.inv.add('gold_brick', 1); });
  await sleep(100);
  const heavy = await walk(600);
  const tier = await p.evaluate(() => { const t = SK.SEASON.inv.tier(); return { w: SK.SEASON.inv.weight(), cap: SK.SEASON.inv.capacity(), speed: t.speed, period: t.period, mm: SK.G.player.moveMul }; });
  check('quá tải (>100%) -> tốc độ x0.5, đói mỗi 5 s; đi thật chậm hẳn', tier.speed === 0.5 && tier.period === 5 && heavy < light * 0.7,
    'tải ' + tier.w + '/' + tier.cap + ', moveMul ' + tier.mm + ', đi 0.6s: nhẹ ' + light.toFixed(1) + 'px / nặng ' + heavy.toFixed(1) + 'px');

  // ---- balô + giáp đổi sức chứa
  const eq = await p.evaluate(() => {
    const I = SK.SEASON.inv;
    I.add('canvas_bag', 1); I.add('roughspun_garb', 1);
    SK.SEASON.debug.step(3);
    return { slots: I.state.backpack.length, cap: I.capacity(), bag: I.state.equip.backpack && I.state.equip.backpack.id, armor: SK.G.player.armorMax, dur: I.state.equip.armor.dur };
  });
  check('đeo Túi vải bố: 30 ô / 50 kg; mặc Áo vải thô: giáp 2', eq.slots === 30 && eq.cap === 50 && eq.armor === 2, JSON.stringify(eq));

  // ---- bảng Balô ở Kho (phím thật + chuột thật)
  await p.evaluate(() => {
    const I = SK.SEASON.inv;
    ['scrap_wood', 'rusty_metal', 'tattered_fabric', 'violet_energy_trace', 'smoked_ham', 'cola', 'treasure_map'].forEach((id, i) => I.add(id, 1 + (i % 3)));
    I.state.secure = { id: 'moonwhite_pearl', n: 1 };
    I.addTo('warehouse', 'wooden_crate_s', 1); I.addTo('warehouse', 'copper_bar', 1); I.addTo('warehouse', 'iron_coin', 0);
    SK.SEASON.debug.tpTo('building', 'warehouse');
  });
  await sleep(300);
  await p.keyboard.press('KeyE');
  const whOpen = await until(p, () => SK.SEASON.ui.isOpen() && SK.SEASON.ui.mode === 'warehouse', null, 2000);
  await sleep(400);
  await p.screenshot({ path: path.join(SHOTS, 'panel_backpack_warehouse.png') });
  // kéo ô balô đầu tiên sang ô kho trống đầu tiên
  const before = await p.evaluate(() => { const I = SK.SEASON.inv; return { b0: I.state.backpack[0] && I.state.backpack[0].id, whUsed: I.state.warehouse.filter(Boolean).length }; });
  const ox = 1386 / 4 - 346.5;   // UW/2 - 346.5
  const [bx, by] = U(ox + 81, 195), [wx, wy] = U(ox + 482.5 + 42.5 * 2, 83.5);
  await p.mouse.move(bx, by); await p.mouse.down(); await p.mouse.move(bx + 30, by + 5, { steps: 4 }); await p.mouse.move(wx, wy, { steps: 8 }); await p.mouse.up();
  await sleep(150);
  const after = await p.evaluate(() => { const I = SK.SEASON.inv; return { b0: I.state.backpack[0] && I.state.backpack[0].id, whUsed: I.state.warehouse.filter(Boolean).length, wh2: I.state.warehouse[2] && I.state.warehouse[2].id }; });
  check('E ở Nhà kho mở bảng kho; kéo-thả chuột balô -> kho', whOpen && !after.b0 && after.whUsed === before.whUsed + 1 && after.wh2 === before.b0, JSON.stringify({ before, after }));
  // nhấp chọn -> thẻ chi tiết
  await p.mouse.click(...U(ox + 121, 195));
  await sleep(200);
  await p.screenshot({ path: path.join(SHOTS, 'panel_backpack_detail.png') });
  const sel = await p.evaluate(() => SK.SEASON.ui.sel);
  check('nhấp ô balô -> chọn món', sel && sel.c === 'bag' && sel.i === 1, JSON.stringify(sel));
  await p.keyboard.press('Escape');
  await sleep(150);

  // ---- bảng Bản đồ + Nhiệm vụ trong căn cứ
  await p.keyboard.press('KeyN'); await sleep(500);
  await p.screenshot({ path: path.join(SHOTS, 'panel_map_base.png') });
  const mapTab = await p.evaluate(() => SK.SEASON.ui.tab);
  await p.keyboard.press('KeyU'); await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'panel_quest.png') });
  const qTab = await p.evaluate(() => SK.SEASON.ui.tab);
  check('phím N mở Bản đồ, U mở Nhiệm vụ', mapTab === 'map' && qTab === 'quest', mapTab + ' / ' + qTab);
  await p.keyboard.press('Escape'); await sleep(150);
  // nút HUD bằng chuột: Balô
  await p.mouse.click(...U(68, 210)); await sleep(200);
  const bagBtn = await p.evaluate(() => SK.SEASON.ui.isOpen() && SK.SEASON.ui.tab === 'bag' && !SK.SEASON.ui.mode);
  await p.mouse.click(...U(1386 / 4 - 346.5 + 250, 52.5)); await sleep(150);
  const closed = await p.evaluate(() => !SK.SEASON.ui.isOpen());
  check('bấm chuột nút Balô trên HUD mở bảng, X đóng', bagBtn && closed, bagBtn + '/' + closed);

  // ---- dùng thuốc trong căn cứ bị chặn
  const baseUse = await p.evaluate(() => SK.SEASON.inv.use(SK.G, 'healing_potion_s'));
  check('không dùng được đồ tiêu hao trong căn cứ', typeof baseUse === 'string', baseUse);

  // ---- ra bản đồ
  const dep = await deploy(p);
  check('đi vào cổng -> ra bản đồ Ngoại ô', dep, await p.evaluate(() => JSON.stringify(SK.SEASON.debug.info && { mode: SK.G.season.mode, map: SK.G.season.map })));
  await p.evaluate(() => { SK.SEASON.debug.god(true); });
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, 'hud_expedition.png') });
  // bỏ bớt vàng để tải về mức nhẹ
  await p.evaluate(() => { SK.SEASON.inv.remove('gold_brick', 6); });
  // Lướt (Shift): dời người, hồi 5 s
  const sp0 = await p.evaluate(() => [SK.G.player.x, SK.G.player.y, SK.SEASON.sprint.cd]);
  await p.keyboard.down('KeyA'); await sleep(60); await p.keyboard.press('ShiftLeft'); await sleep(260); await p.keyboard.up('KeyA');
  const sp1 = await p.evaluate(() => [SK.G.player.x, SK.G.player.y, SK.SEASON.sprint.cd]);
  check('Shift lướt: dời xa hơn đi bộ, hồi chiêu ~5 s', Math.hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]) > 40 && sp1[2] > 4 && sp1[2] <= 5, JSON.stringify({ sp0, sp1 }));
  // Học cách hồi phục: phím 1 (ô tiêu hao thật) + dùng Energy S
  const n0 = await p.evaluate(() => { SK.G.player.hp = 5; return SK.SEASON.inv.count('healing_potion_s'); });
  await p.keyboard.press('Digit1'); await sleep(120);
  const heal = await p.evaluate(() => ({ hp: SK.G.player.hp, n: SK.SEASON.inv.count('healing_potion_s') }));
  await p.evaluate(() => SK.SEASON.inv.use(SK.G, 'energy_potion_s'));
  const lth = await p.evaluate(() => SK.SEASON.quests.complete(SK.SEASON.quests.defs[1]));
  check('phím 1 dùng Thuốc hồi máu (S) ngoài bản đồ (+3 máu); Learn to Heal xong', heal.hp === 8 && heal.n === n0 - 1 && lth, JSON.stringify(heal) + ' quest ' + lth);

  // ---- đói + chết đói (tua bước)
  const hunger = await p.evaluate(() => {
    const I = SK.SEASON.inv, D = SK.SEASON.debug, pl = SK.G.player;
    pl.god = false; pl.hp = pl.hpMax; pl.invulT = 1e9;   // chặn đòn quái, đói vẫn trừ thẳng vào máu
    I.state.hunger = 2;
    const t = I.tier();
    D.step(Math.round(t.period * 60) + 2);
    const h1 = I.state.hunger;
    D.step(Math.round(t.period * 60) + 2);
    const h2 = I.state.hunger, hp0 = pl.hp;
    D.step(2 * 60 + 2);
    const hp1 = pl.hp;
    D.step(2 * 60 + 2);
    pl.god = true; pl.invulT = 0;
    return { period: t.period, h1, h2, hp0, hp1, hp2: pl.hp };
  });
  check('độ no giảm 1 mỗi chu kỳ theo tải; về 0 thì mất 1 máu / 2 s', hunger.h1 === 1 && hunger.h2 === 0 && hunger.hp1 === hunger.hp0 - 1 && hunger.hp2 === hunger.hp0 - 2, JSON.stringify(hunger));
  await p.evaluate(() => { SK.SEASON.inv.state.hunger = 100; });

  // ---- độ bền giáp tụt khi giáp hồi
  const dur = await p.evaluate(() => {
    const I = SK.SEASON.inv, pl = SK.G.player, D = SK.SEASON.debug;
    pl.god = false; pl.invulT = 0;
    const d0 = I.state.equip.armor.dur, a0 = pl.armor;
    SK.hurtPlayer(SK.G, 2);
    const a1 = pl.armor;
    D.step(60 * 6);
    pl.god = true;
    return { d0, a0, a1, a2: pl.armor, d1: I.state.equip.armor.dur };
  });
  check('giáp hồi 2 điểm -> độ bền áo giảm 2', dur.a1 === 0 && dur.a2 === 2 && dur.d1 === dur.d0 - 2, JSON.stringify(dur));

  // ---- First Foray: giết 2 quái thật + sơ tán
  const kills = await p.evaluate(() => {
    const D = SK.SEASON.debug;
    D.tpTo('camp', 0);
    D.step(30);
    const a = D.killNearest(); D.step(5); const b = D.killNearest(); D.step(5);
    return [a, b, SK.SEASON.quests.progress('first_foray', 0)];
  });
  await sleep(300);
  await p.keyboard.press('KeyN'); await sleep(500);
  await p.screenshot({ path: path.join(SHOTS, 'panel_map_expedition.png') });
  await p.keyboard.press('KeyN'); await sleep(100);
  await p.evaluate(() => { SK.SEASON.inv.add('silver_bar', 1); SK.SEASON.inv.add('large_stone', 2); });
  await p.evaluate(() => SK.SEASON.debug.tpTo('exit', 0));
  const back = await until(p, () => SK.G.season.mode === 'base', null, 12000);
  await sleep(400);
  const ex = await p.evaluate(() => {
    const I = SK.SEASON.inv, Q = SK.SEASON.quests;
    return { silver: I.count('silver_bar'), stone: I.count('large_stone'), prog: [Q.progress('first_foray', 0), Q.progress('first_foray', 1)],
      done: Q.complete(Q.defs[0]), coins: I.state.coins, extracts: I.state.stats.extracts };
  });
  check('sơ tán giữ nguyên chiến lợi phẩm', back && ex.silver === 1 && ex.stone === 2 && ex.extracts === 1, JSON.stringify(ex));
  check('First Foray: 2/2 quái + 1/1 sơ tán -> hoàn thành', ex.done && ex.prog[0] === 2 && ex.prog[1] === 1, 'kills ' + JSON.stringify(kills) + ' prog ' + ex.prog);
  // nhận thưởng bằng chuột trong bảng Nhiệm vụ
  await p.keyboard.press('KeyU'); await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'panel_quest_done.png') });
  const RX = 1386 / 4 - 272.5 + 218.5, RW = 324;
  await p.mouse.click(...U(RX + RW - 48, 290)); await sleep(200);
  const paid = await p.evaluate(() => ({ coins: SK.SEASON.inv.state.coins, pot: SK.SEASON.inv.count('healing_potion_m', 'all'), done: SK.SEASON.quests.isDone('first_foray') }));
  check('bấm "Nhận thưởng": +500 xu sắt + 1 Thuốc hồi máu (M)', paid.done && paid.coins === ex.coins + 500 && paid.pot === 1, JSON.stringify(paid));
  await p.keyboard.press('Escape'); await sleep(100);

  // ---- chết: mất balô + trang bị, giữ Hộp an toàn + Kho
  await deploy(p);
  const pre = await p.evaluate(() => { const I = SK.SEASON.inv; I.add('gold_bar', 1); return { bag: I.state.backpack.filter(Boolean).length, wh: I.state.warehouse.filter(Boolean).length, secure: I.state.secure && I.state.secure.id }; });
  await p.evaluate(() => SK.SEASON.debug.kill());
  const respawn = await until(p, () => SK.G.season.mode === 'base' && SK.G.player.st === 'alive', null, 10000);
  await sleep(300);
  const dead = await p.evaluate(() => {
    const I = SK.SEASON.inv, e = I.state.equip;
    return { bag: I.state.backpack.filter(Boolean).length, slots: I.state.backpack.length, wh: I.state.warehouse.filter(Boolean).length, secure: I.state.secure && I.state.secure.id,
      armor: e.armor, pack: e.backpack, w1: e.weapon1 && e.weapon1.id, w2: e.weapon2, pw: SK.G.player.weapons.map(w => w && w.id), hp: SK.G.player.hp };
  });
  check('chết: balô + đồ đeo mất, còn Hộp an toàn + Kho, hồi sinh với súng đầu', respawn && pre.bag > 0 && dead.bag === 0 && dead.slots === 15 && !dead.armor && !dead.pack &&
    dead.secure === pre.secure && dead.wh === pre.wh && dead.w1 === 'w_bad_pistol' && dead.pw[0] === 'bad_pistol', JSON.stringify({ pre, dead }));

  // ---- lưu / nạp localStorage
  const saved = await p.evaluate(() => { SK.SEASON.inv.save(); const raw = JSON.parse(localStorage.getItem('sk.season.v1')); return { wh: raw.warehouse.filter(Boolean).length, secure: raw.secure && raw.secure.id, done: raw.quests.done }; });
  check('lưu vào localStorage sk.season.v1', saved.wh === dead.wh && saved.secure === dead.secure && saved.done.includes('first_foray'), JSON.stringify(saved));

  // ---- cửa hàng: bán + mua 200%
  await p.evaluate(() => { SK.SEASON.inv.state.coins = 5000; SK.SEASON.inv.add('copper_nugget', 1); SK.SEASON.debug.tpTo('building', 'store'); });
  await sleep(200);
  await p.keyboard.press('KeyE');
  await until(p, () => SK.SEASON.ui.mode === 'store', null, 2000);
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'panel_store.png') });
  const shop = await p.evaluate(() => {
    const I = SK.SEASON.inv, c0 = I.state.coins;
    const i = I.state.backpack.findIndex(s => s && s.id === 'copper_nugget');
    I.sell({ c: 'bag', i });
    const c1 = I.state.coins;
    I.buy('healing_potion_s');
    return { c0, c1, c2: I.state.coins };
  });
  check('bán Cục đồng +800, mua Thuốc hồi máu (S) -1000 (200%)', shop.c1 === shop.c0 + 800 && shop.c2 === shop.c1 - 1000, JSON.stringify(shop));
  await p.keyboard.press('Escape');
  await until(p, () => !SK.SEASON.ui.isOpen(), null, 2000);

  // ---- cửa hàng mùa (thanh toán giả)
  await p.mouse.click(...U(1386 / 2 - 27, 22.5)); await sleep(200);
  await p.evaluate(() => { SK.SEASON.ui.shop = { step: 'list' }; });
  await sleep(150);
  await p.screenshot({ path: path.join(SHOTS, 'season_shop.png') });
  await p.evaluate(() => { SK.SEASON.ui.shop = { step: 'pay', pack: 0 }; });
  await sleep(150);
  await p.mouse.click(...U(1386 / 4 - 60, 320 / 2 + 51)); await sleep(150);
  const sc = await p.evaluate(() => SK.SEASON.inv.state.seasonCoins || 0);
  check('Cửa hàng mùa: xác nhận thanh toán giả -> +500 xu mùa', sc === 500, 'xu mùa ' + sc);
  await p.keyboard.press('Escape');
  await p.evaluate(() => SK.SEASON.ui.close()); await sleep(100);

  await p.keyboard.press('Escape'); await sleep(150);
  const pz1 = await p.evaluate(() => ({ ui: SK.SEASON.ui.paused, world: SK.G.season.paused, dom: !!document.getElementById('sk-season-pause') }));
  await p.keyboard.press('Escape'); await sleep(150);
  const pz2 = await p.evaluate(() => ({ ui: SK.SEASON.ui.paused, world: SK.G.season.paused, dom: !!document.getElementById('sk-season-pause') }));
  check('Esc mở một bảng tạm dừng (canvas), Esc nữa thì đóng', pz1.ui && pz1.world && !pz1.dom && !pz2.ui && !pz2.world && !pz2.dom, JSON.stringify([pz1, pz2]));

  // Cỡ màn khác: 1920x1080 và điện thoại ngang 844x390 (chạm)
  for (const [w, h, name, touch] of [[1920, 1080, 'hud_1080p.png', false], [844, 390, 'hud_phone_touch.png', true], [844, 390, 'panel_phone_bag.png', true]]) {
    await p.setViewportSize({ width: w, height: h }); await sleep(300);
    await p.evaluate(([t, bag]) => { SK.input.touchMode = t; if (bag) SK.SEASON.ui.open('warehouse'); else SK.SEASON.ui.close(); }, [touch, name.includes('bag')]);
    await sleep(250);
    await p.screenshot({ path: path.join(SHOTS, name) });
  }
  await p.evaluate(() => SK.SEASON.ui.close());
  check('không lỗi trang', !errs.length, errs.slice(0, 5).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + pass + '/' + (pass + fail) + ' đạt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(2); });
