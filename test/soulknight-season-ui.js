/*
 * Kiểm thử kho đồ + HUD + bảng của Season Mode (games/soulknight/js/season/inventory.js, ui.js, quests.js), số liệu thật 8.6.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-season-ui.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-season-ui/  (khung 1386x640 = đúng cỡ ảnh chụp của chủ dự án).
 *
 * Chạy mode thật (SK.SEASON.start), bấm phím/chuột thật cho HUD và bảng (toạ độ nút lấy từ ui.hits());
 * dùng móc SK.SEASON.debug để dịch chuyển / giết quái / tua bước cho nhanh.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1';
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
async function press(p, key) { await p.keyboard.down(key); await sleep(50); await p.keyboard.up(key); await sleep(80); }
// Tâm vùng bấm của ui (đơn vị UI) -> px CSS.
async function hitXY(p, act, match) {
  return p.evaluate(([act, match]) => {
    const { d, dpr } = SK.SEASON.ui.metrics();
    const h = SK.SEASON.ui.hits().find(q => q.act === act && Object.keys(match || {}).every(k => JSON.stringify(q[k]) === JSON.stringify(match[k])));
    return h ? [(h.x + h.w / 2) * d / dpr, (h.y + h.h / 2) * d / dpr] : null;
  }, [act, match]);
}
async function clickHit(p, act, match) {
  const xy = await hitXY(p, act, match);
  if (!xy) return false;
  await p.mouse.click(xy[0], xy[1]); await sleep(150);
  return true;
}
async function deploy(p) {
  await p.evaluate(() => { const g = SK.G.season.gates.find(q => q.kind === 'deploy'); SK.SEASON.debug.tp(g.x, g.y - 12); });
  return until(p, () => SK.G.season.mode === 'expedition', null, 8000);
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
  await p.evaluate(() => { try { localStorage.removeItem('sk.season.v2'); } catch (_) { /* */ } });
  await p.reload();
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
  await p.evaluate(async () => { await document.fonts.ready; try { await document.fonts.load('800 16px Nunito', 'Balô'); } catch (_) { /* offline */ } });

  // ---- dữ liệu thật
  const data = await p.evaluate(() => {
    const S = SK.SEASON, it = S.items, T = S.T;
    const all = Object.values(it);
    const loot = ['enemy_minion', 'enemy_elite', 'food', 'start_supply'].map(c => [c, S.loot(c)]);
    return {
      n: all.length, types: [...new Set(all.map(x => x.type))].sort().join(','),
      noIcon: all.filter(x => !SK.frame(x.icon)).map(x => x.id),
      pot: it.hp_pot_0 && [it.hp_pot_0.name, it.hp_pot_0.icon, it.hp_pot_0.effect.hp, it.hp_pot_0.stack, it.hp_pot_0.useTime],
      loot: loot.map(([c, l]) => c + ':' + l.map(x => x.id + 'x' + x.n).join('+')),
      valid: loot.every(([, l]) => l.every(x => !!S.itemDef(x.id))),
      tasks: T.tasks.length, craft: T.craft.length, shop: T.shop.length
    };
  });
  check('bảng vật phẩm thật (escape_tbescapeitemdatabase) + mọi món có icon', data.n >= 700 && !data.noIcon.length, data.n + ' món: ' + data.types + '; thiếu icon: ' + data.noIcon.slice(0, 5).join(','));
  check('Bình Máu Nhỏ = Item_20, hồi 3, chồng 5, dùng 2 s [ĐO Params]', data.pot && data.pot.join('|') === 'Bình Máu Nhỏ|sitem/Item_20|3|5|2', JSON.stringify(data.pot));
  check('loot() rút từ bảng rơi thật', data.valid, data.loot.join(' | '));
  check('38 nhiệm vụ, 59 công thức, cửa hàng có hàng', data.tasks === 38 && data.craft === 59 && data.shop > 5, data.tasks + '/' + data.craft + '/' + data.shop);

  // ---- vào mode thật
  const started = await p.evaluate(() => SK.SEASON.start('knight'));
  await until(p, () => SK.G.state === 'season' && SK.G.player && SK.SEASON.ui, null, 5000);
  await sleep(900);
  const st0 = await p.evaluate(() => {
    const pl = SK.G.player, h = SK.DS.heroes.knight, I = SK.SEASON.inv;
    return { want: h.hp + 2 * h.armor, hp: pl.hp, hpMax: pl.hpMax, armorMax: pl.armorMax, w: I.state.equip.weapon1 && I.state.equip.weapon1.id,
      wdur: I.state.equip.weapon1 && I.state.equip.weapon1.dur, bag: I.state.backpack.filter(Boolean).map(s => s.id), hunger: I.state.hunger, slots: I.slots(), kg: I.capacity() };
  });
  check('vào Season: máu = gốc + 2×giáp, giáp 0, balô 15 ô / 40 kg, no 100',
    started && st0.hpMax === st0.want && st0.armorMax === 0 && st0.hunger === 100 && st0.slots === 15 && st0.kg === 40, JSON.stringify(st0));
  check('bộ khởi đầu thật: Chim Ưng Sa Mạc + Bình Máu Nhỏ + Bình Năng Lượng Nhỏ + đồ ăn',
    !!st0.w && st0.bag.includes('hp_pot_0') && st0.bag.includes('energy_pot_0') && st0.bag.some(id => /^food_/.test(id)), st0.w + ' bền ' + st0.wdur + ' · ' + st0.bag.join(','));
  await p.screenshot({ path: path.join(SHOTS, 'hud_base.png') });

  // ---- quá tải -> chậm (đi thật)
  async function walk(ms) {
    const a = await p.evaluate(() => [SK.G.player.x, SK.G.player.y]);
    await p.keyboard.down('KeyD'); await sleep(ms); await p.keyboard.up('KeyD');
    const c = await p.evaluate(() => [SK.G.player.x, SK.G.player.y]);
    return Math.hypot(c[0] - a[0], c[1] - a[1]);
  }
  await p.evaluate(() => SK.SEASON.debug.tpTo('building', 'Shop'));
  const light = await walk(600);
  const heavyAdd = await p.evaluate(() => {
    const I = SK.SEASON.inv; let n = 0;
    while (I.weight() / I.capacity() < 1.02 && n < 60) { I.add('material_wood_1', 1); n++; }
    return n;
  });
  await p.evaluate(() => SK.SEASON.debug.tpTo('building', 'Shop'));
  await sleep(100);
  const heavy = await walk(600);
  const tier = await p.evaluate(() => { const t = SK.SEASON.inv.tier(); return { i: t.i, w: SK.SEASON.inv.weight(), cap: SK.SEASON.inv.capacity(), speed: t.speed, hunger: t.hunger, mm: SK.G.player.moveMul }; });
  check('quá tải 100-120% -> cấp 3, tốc ×0.5, đói ×1.5 [ĐO GetCarryWeightLevel]; đi thật chậm hẳn',
    tier.i === 3 && tier.speed === 0.5 && tier.hunger === 1.5 && heavy < light * 0.7,
    '+' + heavyAdd + ' Gỗ Cũ, tải ' + tier.w + '/' + tier.cap + ', moveMul ' + tier.mm + ', đi 0.6 s: nhẹ ' + light.toFixed(1) + ' / nặng ' + heavy.toFixed(1) + ' px');
  await p.evaluate(() => SK.SEASON.inv.remove('material_wood_1', 30));

  // ---- balô + giáp
  const eq = await p.evaluate(() => {
    const I = SK.SEASON.inv, B = I.state.backpack;
    I.add('bag_cloth_satchel', 1); I.add('armor_sackcloth_bag', 1);
    const bi = B.findIndex(s => s && s.id === 'bag_cloth_satchel');
    I.move({ c: 'bag', i: bi }, { c: 'equip', k: 'backpack' });
    const ai = B.findIndex(s => s && s.id === 'armor_sackcloth_bag');
    I.move({ c: 'bag', i: ai }, { c: 'equip', k: 'armor' });
    SK.SEASON.debug.step(3);
    return { slots: I.state.backpack.length, cap: I.capacity(), bag: I.state.equip.backpack && I.state.equip.backpack.id, armor: SK.G.player.armorMax, max: I.state.equip.armor && I.state.equip.armor.max };
  });
  check('đeo Túi Vải Đeo Chéo: 30 ô / 50 kg; mặc Áo Vải Thô: giáp 2, bền tối đa 25', eq.slots === 30 && eq.cap === 50 && eq.armor === 2 && eq.max === 25, JSON.stringify(eq));

  // ---- Kho (E thật + kéo-thả chuột thật)
  await p.evaluate(() => {
    const I = SK.SEASON.inv;
    ['material_metal_1', 'material_cloth_1', 'misc_purple_energy_trace', 'food_stale_bread'].forEach((id, i) => I.add(id, 1 + (i % 3)));
    I.state.secure = I.makeStack('misc_gold_coin', 1);
    I.addTo('warehouse', 'material_wood_1', 3);
    SK.SEASON.debug.tpTo('building', 'Warehouse');
  });
  await sleep(300);
  const whLabel = (await p.evaluate(() => SK.SEASON.debug.info.interact));
  await press(p, 'KeyE');
  const whOpen = await until(p, () => SK.SEASON.ui.isOpen() && SK.SEASON.ui.mode === 'warehouse', null, 2000);
  await sleep(400);
  await p.screenshot({ path: path.join(SHOTS, 'panel_warehouse.png') });
  const before = await p.evaluate(() => { const I = SK.SEASON.inv; return { b0: I.state.backpack[0] && I.state.backpack[0].id, whUsed: I.state.warehouse.filter(Boolean).length, whFree: I.state.warehouse.indexOf(null), whN: I.state.warehouse.length }; });
  const from = await hitXY(p, 'slot', { ref: { c: 'bag', i: 0 } });
  const to = await hitXY(p, 'slot', { ref: { c: 'wh', i: before.whFree } });
  if (from && to) {
    await p.mouse.move(from[0], from[1]); await p.mouse.down(); await p.mouse.move(from[0] + 30, from[1] + 5, { steps: 4 });
    await p.mouse.move(to[0], to[1], { steps: 8 }); await p.mouse.up();
  }
  await sleep(150);
  const after = await p.evaluate(i => { const I = SK.SEASON.inv; return { b0: I.state.backpack[0] && I.state.backpack[0].id, whUsed: I.state.warehouse.filter(Boolean).length, wh: I.state.warehouse[i] && I.state.warehouse[i].id }; }, before.whFree);
  check('E ở Nhà Kho mở kho 64 ô [ĐO warehousecapacity]; kéo-thả balô -> kho', whOpen && before.whN === 64 && !after.b0 && after.whUsed === before.whUsed + 1 && after.wh === before.b0,
    'nhãn "' + whLabel + '" ' + JSON.stringify({ before, after }));
  await clickHit(p, 'slot', { ref: { c: 'bag', i: 1 } });
  await sleep(200);
  await p.screenshot({ path: path.join(SHOTS, 'panel_bag_detail.png') });
  const sel = await p.evaluate(() => SK.SEASON.ui.sel);
  check('nhấp ô balô -> thẻ chi tiết', sel && sel.c === 'bag' && sel.i === 1, JSON.stringify(sel));
  await press(p, 'Escape');

  // ---- Bản đồ + Nhiệm vụ trong căn cứ
  await press(p, 'KeyN'); await sleep(500);
  await p.screenshot({ path: path.join(SHOTS, 'panel_map_base.png') });
  const mapTab = await p.evaluate(() => SK.SEASON.ui.tab);
  await press(p, 'KeyU'); await sleep(300);
  const qTab = await p.evaluate(() => SK.SEASON.ui.tab);
  await p.screenshot({ path: path.join(SHOTS, 'panel_quest.png') });
  await clickHit(p, 'qtab', { tab: 'all' });
  await sleep(200);
  await p.screenshot({ path: path.join(SHOTS, 'panel_quest_all.png') });
  const qs = await p.evaluate(() => {
    const Q = SK.SEASON.quests;
    return { all: Q.all().length, web: Q.all().filter(d => d.web).length, acc: Q.accepted().map(d => d.titleEn) };
  });
  check('N mở Bản đồ, U mở Nhiệm vụ', mapTab === 'map' && qTab === 'quest', mapTab + ' / ' + qTab);
  check('bảng Nhiệm vụ đủ 38 việc; việc ngoài Vành Đai ghi "chưa có ở bản web"', qs.all === 38 && qs.web > 0 && qs.web < 38 && qs.acc.includes('First Foray'),
    'khoá ' + qs.web + '/38 · đang nhận: ' + qs.acc.join(', '));
  await press(p, 'Escape');
  await p.mouse.click(...(await p.evaluate(() => { const { d, dpr } = SK.SEASON.ui.metrics(); return [68 * d / dpr, 210 * d / dpr]; })));
  await sleep(200);
  const bagBtn = await p.evaluate(() => SK.SEASON.ui.isOpen() && SK.SEASON.ui.tab === 'bag' && !SK.SEASON.ui.mode);
  await p.screenshot({ path: path.join(SHOTS, 'panel_bag.png') });
  await clickHit(p, 'close');
  const closed = await p.evaluate(() => !SK.SEASON.ui.isOpen());
  check('bấm chuột nút Balô trên HUD mở bảng, X đóng', bagBtn && closed, bagBtn + '/' + closed);
  const baseUse = await p.evaluate(() => SK.SEASON.inv.use(SK.G, 'hp_pot_0'));
  check('không dùng được đồ tiêu hao trong căn cứ', typeof baseUse === 'string', baseUse);

  // ---- ra Vành Đai Căn Cứ
  const dep = await deploy(p);
  check('đứng trong cổng -> ra Vành Đai Căn Cứ', dep, await p.evaluate(() => SK.G.season.mode + '/' + SK.G.season.map));
  await p.evaluate(() => SK.SEASON.debug.god(true));
  await sleep(600);
  await p.screenshot({ path: path.join(SHOTS, 'hud_expedition.png') });
  const sp0 = await p.evaluate(() => [SK.G.player.x, SK.G.player.y]);
  await p.keyboard.down('KeyA'); await sleep(60); await press(p, 'ShiftLeft'); await sleep(200); await p.keyboard.up('KeyA');
  const sp1 = await p.evaluate(() => [SK.G.player.x, SK.G.player.y, SK.SEASON.sprint.cd]);
  check('Shift lướt: dời xa hơn đi bộ, hồi 5 s [ĐO EscapePlayerCombatConfig]', Math.hypot(sp1[0] - sp0[0], sp1[1] - sp0[1]) > 40 && sp1[2] > 4 && sp1[2] <= 5, JSON.stringify({ sp0, sp1 }));
  // phím 1 = ô tiêu hao; Bình Máu Nhỏ cần 2 s mới có tác dụng
  const n0 = await p.evaluate(() => { SK.G.player.hp = 5; const I = SK.SEASON.inv; if (!I.count('hp_pot_0')) I.add('hp_pot_0', 1); if (!I.count('energy_pot_0')) I.add('energy_pot_0', 1); I.state.quick[0] = 'hp_pot_0'; return I.count('hp_pot_0'); });
  await press(p, 'Digit1');
  const mid = await p.evaluate(() => ({ hp: SK.G.player.hp, using: SK.SEASON.inv.using && SK.SEASON.inv.using.id }));
  await p.evaluate(() => SK.SEASON.debug.step(130));
  const heal = await p.evaluate(() => ({ hp: SK.G.player.hp, n: SK.SEASON.inv.count('hp_pot_0') }));
  await p.evaluate(() => { SK.SEASON.inv.use(SK.G, 'energy_pot_0'); SK.SEASON.debug.step(130); });
  const lth = await p.evaluate(() => { const Q = SK.SEASON.quests, d = Q.byId(10002); return Q.complete(d); });
  check('phím 1: dùng Bình Máu Nhỏ, 2 s sau +3 máu; Học Cách Hồi Phục xong', mid.using === 'hp_pot_0' && mid.hp === 5 && heal.hp === 8 && heal.n === n0 - 1 && lth, JSON.stringify({ mid, heal, lth }));

  // ---- đói + chết đói (tua bước)
  const hunger = await p.evaluate(() => {
    const I = SK.SEASON.inv, D = SK.SEASON.debug, pl = SK.G.player;
    pl.god = false; pl.hp = pl.hpMax; pl.invulT = 1e9;
    I.state.hunger = 50;
    const f = I.tier().hunger;
    D.step(600);
    const drop = 50 - I.state.hunger;
    I.state.hunger = 0.001;
    D.step(5);
    const hp0 = pl.hp;
    D.step(125);
    const hp1 = pl.hp;
    pl.god = true; pl.invulT = 0; I.state.hunger = 100;
    return { f, drop: Math.round(drop * 1000) / 1000, want: Math.round(0.14 * f * 10 * 1000) / 1000, hp0, hp1 };
  });
  check('độ no -0.14/s × hệ số tải; hết no mất 0.5 máu/s [ĐO TickHunger]', Math.abs(hunger.drop - hunger.want) < 0.05 && hunger.hp1 === hunger.hp0 - 1, JSON.stringify(hunger));

  // ---- độ bền giáp
  const dur = await p.evaluate(() => {
    const I = SK.SEASON.inv, pl = SK.G.player, D = SK.SEASON.debug;
    pl.god = false; pl.invulT = 0; pl.hp = pl.hpMax;
    const d0 = I.state.equip.armor.dur;
    SK.hurtPlayer(SK.G, 2);
    const a1 = pl.armor;
    D.step(60 * 6);
    pl.god = true;
    return { d0, a1, a2: pl.armor, d1: I.state.equip.armor.dur };
  });
  check('giáp hồi 2 điểm -> độ bền áo -2', dur.a1 === 0 && dur.a2 === 2 && dur.d1 === dur.d0 - 2, JSON.stringify(dur));

  // ---- độ bền vũ khí: bắn 2 s = -1 [ĐO EscapeWeaponDurabilityTracker]
  const wd0 = await p.evaluate(() => SK.SEASON.inv.curWeaponStack().dur);
  await p.keyboard.down('KeyJ'); await sleep(4600); await p.keyboard.up('KeyJ');
  const wd1 = await p.evaluate(() => SK.SEASON.inv.curWeaponStack().dur);
  check('giữ nút bắn ~4.6 s -> 0.35 s miễn phí, còn lại cứ 2 s -1 bền => -2 [ĐO BillUntil]', wd0 - wd1 === 2, wd0 + ' → ' + wd1);

  // ---- rương: bảng hộp chứa
  await p.evaluate(() => SK.SEASON.debug.tpTo('crate', 0));
  await sleep(250);
  await press(p, 'KeyE');
  const boxOpen = await until(p, () => SK.SEASON.ui.mode === 'box' && SK.SEASON.inv.box, null, 2000);
  await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, 'panel_box.png') });
  await until(p, () => { const B = SK.SEASON.inv.box; return B && B.slots.every((s, i) => !s || SK.SEASON.inv.boxVisible(i)); }, null, 15000);
  const tk = await clickHit(p, 'takeAll');
  const boxLeft = await p.evaluate(() => SK.SEASON.inv.box ? SK.SEASON.inv.box.slots.filter(Boolean).length : -1);
  check('E mở bảng rương; nút Lấy hết chuyển đồ vào balô', boxOpen && tk && boxLeft === 0, 'còn ' + boxLeft);
  await clickHit(p, 'close');

  // ---- Đứng Vững Chân: 2 quái + rút lui
  const kills = await p.evaluate(() => {
    const D = SK.SEASON.debug;
    D.tpTo('enemy', 0); D.step(10);
    const a = D.killNearest(); D.step(5); const b = D.killNearest(); D.step(5);
    return [a, b, SK.SEASON.quests.progress(SK.SEASON.quests.byId(10001), 0)];
  });
  await press(p, 'KeyN'); await sleep(500);
  await p.screenshot({ path: path.join(SHOTS, 'panel_map_expedition.png') });
  await press(p, 'KeyN');
  await p.evaluate(() => { SK.SEASON.inv.add('material_metal_1', 2); SK.SEASON.inv.add('material_wood_1', 4); SK.SEASON.debug.tpTo('exit', 0); });
  const back = await until(p, () => SK.G.season.mode === 'base', null, 12000);
  await sleep(400);
  const ex = await p.evaluate(() => {
    const I = SK.SEASON.inv, Q = SK.SEASON.quests, d = Q.byId(10001);
    return { metal: I.count('material_metal_1', 'all'), prog: [Q.progress(d, 0), Q.progress(d, 1)], done: Q.complete(d), coins: I.state.coins, pot: I.count('hp_pot_1', 'all') };
  });
  check('rút lui giữ chiến lợi phẩm; Đứng Vững Chân 2/2 + 1/1', back && ex.metal >= 2 && ex.done && ex.prog.join() === '2,1', JSON.stringify({ kills, ex }));
  await press(p, 'KeyU'); await sleep(300);
  await p.evaluate(() => { SK.SEASON.ui.open('quest'); });
  await clickHit(p, 'qsel', { id: 10001 });
  await p.screenshot({ path: path.join(SHOTS, 'panel_quest_done.png') });
  await clickHit(p, 'claim', { id: 10001 });
  const paid = await p.evaluate(() => ({ coins: SK.SEASON.inv.state.coins, pot: SK.SEASON.inv.count('hp_pot_1', 'all'), done: SK.SEASON.quests.isDone(10001), acc: SK.SEASON.quests.accepted().map(d => d.id) }));
  check('bấm "Nhận thưởng": +500 Xu Sắt + 1 Bình Máu Vừa; mở việc tiếp theo', paid.done && paid.coins === ex.coins + 500 && paid.pot === ex.pot + 1 && paid.acc.includes(10003), JSON.stringify(paid));
  await press(p, 'Escape');

  // ---- Bàn Thiết Kế: xây Bàn Chế Tạo (1 Gỗ Cũ)
  await p.evaluate(() => SK.SEASON.debug.tpTo('building', 'DesignTable'));
  await sleep(250);
  const dLabel = await p.evaluate(() => SK.SEASON.debug.info.interact);
  await press(p, 'KeyE');
  const dOpen = await until(p, () => SK.SEASON.ui.mode === 'design', null, 2000);
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'panel_design.png') });
  await clickHit(p, 'upgradeB', { arg: 'Workshop' });
  const built = await p.evaluate(() => ({ lv: SK.SEASON.inv.buildLevel('Workshop'), inMap: SK.G.map.buildings.some(q => q.id === 'Workshop'), q: SK.SEASON.quests.complete(SK.SEASON.quests.byId(10003)) }));
  check('Bàn Thiết Kế: bấm Xây Bàn Chế Tạo -> cấp 1, nhà hiện ở căn cứ, nhiệm vụ xong', dOpen && built.lv === 1 && built.inMap && built.q, 'nhãn "' + dLabel + '" ' + JSON.stringify(built));
  await press(p, 'Escape');

  // ---- Bàn Chế Tạo: chế tạo vũ khí
  await p.evaluate(() => SK.SEASON.debug.tpTo('building', 'Workshop'));
  await sleep(250);
  await press(p, 'KeyE');
  const cOpen = await until(p, () => /^craft:/.test(SK.SEASON.ui.mode || ''), null, 2000);
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'panel_craft.png') });
  const c0 = await p.evaluate(() => SK.SEASON.inv.count('weapon_002', 'all'));
  await clickHit(p, 'craft', { arg: 'bp_weapon_002' });
  const c1 = await p.evaluate(() => SK.SEASON.inv.count('weapon_002', 'all'));
  check('Bàn Chế Tạo: 2 Sắt + 2 Gỗ -> vũ khí [ĐO craftblueprint]', cOpen && c1 === c0 + 1, c0 + ' → ' + c1);
  await press(p, 'Escape');

  // ---- Cơ sở huấn luyện: Mở rộng túi 1
  await p.evaluate(() => { SK.SEASON.inv.state.coins += 1000; SK.SEASON.inv.add('misc_purple_energy_trace', 3); SK.SEASON.debug.tpTo('building', 'Researcher'); });
  await sleep(250);
  await press(p, 'KeyE');
  const tOpen = await until(p, () => SK.SEASON.ui.mode === 'training', null, 2000);
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'panel_training.png') });
  const s0 = await p.evaluate(() => SK.SEASON.inv.slots());
  await clickHit(p, 'train', { arg: 'bag_ug_bp_1' });
  const s1 = await p.evaluate(() => SK.SEASON.inv.slots());
  check('Cơ sở huấn luyện: Mở rộng túi +5 ô (1000 xu + 3 Vết Năng Lượng Tím)', tOpen && s1 === s0 + 5, s0 + ' → ' + s1);
  await press(p, 'Escape');

  // ---- cửa hàng: mua ×2 giá trị, bán theo độ bền
  await p.evaluate(() => { SK.SEASON.inv.state.coins = 5000; SK.SEASON.inv.add('material_wood_1', 1); SK.SEASON.debug.tpTo('building', 'Shop'); });
  await sleep(250);
  await press(p, 'KeyE');
  const sOpen = await until(p, () => SK.SEASON.ui.mode === 'store', null, 2000);
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, 'panel_store.png') });
  const shop = await p.evaluate(() => {
    const I = SK.SEASON.inv, c0 = I.state.coins;
    const i = I.state.backpack.findIndex(s => s && s.id === 'material_wood_1');
    const n = I.state.backpack[i].n;
    I.sell({ c: 'bag', i });
    const c1 = I.state.coins;
    I.buy('hp_pot_0');
    return { c0, n, c1, c2: I.state.coins };
  });
  check('bán chồng Gỗ Cũ +100/cái; mua Bình Máu Nhỏ -1000 (giá trị 500 × 2)', sOpen && shop.c1 === shop.c0 + 100 * shop.n && shop.c2 === shop.c1 - 1000, JSON.stringify(shop));
  await press(p, 'Escape');

  // ---- chết: Rương Tử Vong, giữ Rương An Toàn + Kho
  await deploy(p);
  const pre = await p.evaluate(() => { const I = SK.SEASON.inv; return { bag: I.state.backpack.filter(Boolean).length, wh: I.state.warehouse.filter(Boolean).length, secure: I.state.secure && I.state.secure.id }; });
  await p.evaluate(() => SK.SEASON.debug.kill());
  const respawn = await until(p, () => SK.G.season.mode === 'base' && SK.G.player.st === 'alive', null, 10000);
  await sleep(300);
  const dead = await p.evaluate(() => {
    const I = SK.SEASON.inv, e = I.state.equip;
    return { bag: I.state.backpack.filter(Boolean).length, slots: I.state.backpack.length, wh: I.state.warehouse.filter(Boolean).length, secure: I.state.secure && I.state.secure.id,
      armor: !!e.armor, pack: !!e.backpack, box: I.state.deathBox && I.state.deathBox.slots.filter(Boolean).length, pw: SK.G.player.weapons.filter(Boolean).length };
  });
  check('chết: balô + đồ đeo vào Rương Tử Vong, còn Rương An Toàn + Kho, vẫn có súng', respawn && pre.bag > 0 && dead.bag === 0 && dead.slots === 20 && !dead.armor && !dead.pack &&
    dead.box > pre.bag && dead.secure === pre.secure && dead.wh === pre.wh && dead.pw > 0, JSON.stringify({ pre, dead }));

  const saved = await p.evaluate(() => { SK.SEASON.inv.save(); const raw = JSON.parse(localStorage.getItem('sk.season.v2')); return { wh: raw.warehouse.filter(Boolean).length, secure: raw.secure && raw.secure.id, done: raw.quests.done, ws: raw.build.Workshop, tr: raw.training }; });
  check('lưu localStorage sk.season.v2 (kho, nhiệm vụ, nhà, huấn luyện)', saved.wh === dead.wh && saved.secure === dead.secure && saved.done.includes(10001) && saved.ws === 1 && saved.tr.includes('bag_ug_bp_1'), JSON.stringify(saved));

  // ---- tạm dừng + cửa hàng mùa (thanh toán giả)
  await press(p, 'Escape');
  const pz1 = await p.evaluate(() => ({ ui: SK.SEASON.ui.paused, world: SK.G.season.paused }));
  await sleep(200);
  await p.screenshot({ path: path.join(SHOTS, 'panel_pause.png') });
  await press(p, 'Escape');
  const pz2 = await p.evaluate(() => ({ ui: SK.SEASON.ui.paused, world: SK.G.season.paused }));
  check('Esc mở bảng tạm dừng, Esc nữa thì đóng', pz1.ui && pz1.world && !pz2.ui && !pz2.world, JSON.stringify([pz1, pz2]));
  await p.evaluate(() => { SK.SEASON.ui.openSeasonShop(); });
  await sleep(200);
  await p.screenshot({ path: path.join(SHOTS, 'season_shop.png') });
  await p.evaluate(() => SK.SEASON.ui.close());

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
